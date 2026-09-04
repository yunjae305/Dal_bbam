import { NextRequest } from 'next/server';
import { authorizeAdminRequest } from '@/backend/auth/admin';
import { apiData, apiError, isMutationAllowed } from '@/backend/http';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';
import { contentHash, generateStampArtwork } from '@/backend/openai';
import { buildStampArtworkPrompt, stampArtCooldownSeconds, stampArtRateLimit, validUuid } from '@/backend/stamps';

type GenerateBody = {
  targetId?: string;
  artDirection?: string;
  regenerate?: boolean;
  approve?: boolean;
};

type ReviewBody = {
  artworkId?: string;
  action?: 'approve' | 'reject';
  note?: string;
};

type Database = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

function adminActor(authorization: Awaited<ReturnType<typeof authorizeAdminRequest>>): string {
  if (authorization.method === 'session') {
    return `session:${authorization.user?.email ?? authorization.user?.id ?? 'unknown'}`.slice(0, 160);
  }
  return 'admin-api-secret';
}

async function approveArtwork(
  db: Database,
  artworkId: string,
  reviewedBy: string,
  note: string | null
): Promise<{ ok: true; imageUrl: string } | { ok: false; notReviewable?: boolean; message: string }> {
  const { data: artwork, error: readError } = await db
    .from('stamp_artworks')
    .select('id, stamp_target_id, status, storage_path, mime_type, public_url')
    .eq('id', artworkId)
    .maybeSingle();
  if (readError) return { ok: false, message: readError.message };
  if (!artwork || artwork.status !== 'pending_review' || !artwork.storage_path || !artwork.mime_type) {
    return { ok: false, notReviewable: true, message: 'Artwork is not pending review.' };
  }

  const { data: previousApproved } = await db
    .from('stamp_artworks')
    .select('id, storage_path')
    .eq('stamp_target_id', artwork.stamp_target_id)
    .eq('status', 'approved')
    .neq('id', artworkId)
    .maybeSingle();

  const storagePath = String(artwork.storage_path);
  const { data: stagedFile, error: downloadError } = await db.storage
    .from('stamp-artworks-staging')
    .download(storagePath);
  if (downloadError || !stagedFile) {
    return { ok: false, message: downloadError?.message ?? 'Staged artwork is missing.' };
  }

  const bytes = await stagedFile.arrayBuffer();
  const { error: uploadError } = await db.storage.from('stamp-artworks').upload(
    storagePath,
    bytes,
    { contentType: String(artwork.mime_type), cacheControl: '31536000', upsert: true }
  );
  if (uploadError) return { ok: false, message: uploadError.message };

  const { data: publicUrlData } = db.storage.from('stamp-artworks').getPublicUrl(storagePath);
  const imageUrl = publicUrlData.publicUrl;
  if (!imageUrl) {
    await db.storage.from('stamp-artworks').remove([storagePath]);
    return { ok: false, message: 'Approved artwork URL is unavailable.' };
  }

  const { error: urlError } = await db.from('stamp_artworks')
    .update({ public_url: imageUrl, updated_at: new Date().toISOString() })
    .eq('id', artworkId)
    .eq('status', 'pending_review');
  if (urlError) {
    await db.storage.from('stamp-artworks').remove([storagePath]);
    return { ok: false, message: urlError.message };
  }

  const { data: approved, error: approvalError } = await db.rpc('approve_stamp_artwork', {
    p_artwork_id: artworkId,
    p_reviewed_by: reviewedBy,
    p_review_note: note
  });
  if (approvalError || approved !== true) {
    const { data: current } = await db
      .from('stamp_artworks')
      .select('status, public_url')
      .eq('id', artworkId)
      .maybeSingle();
    if (current?.status !== 'approved') {
      await db.storage.from('stamp-artworks').remove([storagePath]);
      await db.from('stamp_artworks')
        .update({ public_url: null, updated_at: new Date().toISOString() })
        .eq('id', artworkId)
        .eq('status', 'pending_review');
      return { ok: false, message: approvalError?.message ?? 'Approval was rejected.' };
    }
  }

  const { error: stagingCleanupError } = await db.storage
    .from('stamp-artworks-staging')
    .remove([storagePath]);
  if (stagingCleanupError) {
    console.error('[stamps] approved staging cleanup delayed', stagingCleanupError.message);
  }
  if (previousApproved?.storage_path) {
    const previousPath = String(previousApproved.storage_path);
    const { error: previousCleanupError } = await db.storage.from('stamp-artworks').remove([previousPath]);
    if (previousCleanupError) {
      console.error('[stamps] archived artwork cleanup delayed', previousCleanupError.message);
    } else {
      await db.from('stamp_artworks')
        .update({ storage_path: null, public_url: null, updated_at: new Date().toISOString() })
        .eq('id', previousApproved.id)
        .eq('status', 'archived');
    }
  }
  return { ok: true, imageUrl };
}

export async function GET(request: NextRequest) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return apiError('ADMIN_UNAUTHORIZED', '관리자 인증이 필요합니다.', 401);
  const db = createSupabaseAdminClient();
  if (!db) return apiError('DATABASE_UNAVAILABLE', '스탬프 저장소가 설정되지 않았습니다.', 503);

  let query = db
    .from('stamp_artworks')
    .select('id, stamp_target_id, version, status, prompt, prompt_hash, model, storage_path, public_url, mime_type, failure_reason, requested_by, reviewed_by, review_note, generated_at, approved_at, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  const targetId = request.nextUrl.searchParams.get('targetId')?.trim();
  if (targetId && !validUuid(targetId)) return apiError('INVALID_STAMP_TARGET', '유효한 targetId가 필요합니다.');
  if (targetId) query = query.eq('stamp_target_id', targetId);
  const { data, error } = await query;
  if (error) return apiError('STAMP_ARTWORKS_READ_FAILED', '스탬프 아트 이력을 불러오지 못했습니다.', 500);
  const rows = await Promise.all((data ?? []).map(async row => {
    if (row.public_url || !row.storage_path || row.status === 'approved') return { ...row, preview_url: row.public_url };
    const { data: preview } = await db.storage
      .from('stamp-artworks-staging')
      .createSignedUrl(String(row.storage_path), 600);
    return { ...row, preview_url: preview?.signedUrl ?? null };
  }));
  return apiData(rows, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  if (!isMutationAllowed(request)) return apiError('ORIGIN_REJECTED', '허용되지 않은 요청 출처입니다.', 403);
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return apiError('ADMIN_UNAUTHORIZED', '관리자 인증이 필요합니다.', 401);
  const db = createSupabaseAdminClient();
  if (!db) return apiError('DATABASE_UNAVAILABLE', '스탬프 저장소가 설정되지 않았습니다.', 503);

  let body: GenerateBody;
  try {
    body = await request.json() as GenerateBody;
  } catch {
    return apiError('INVALID_BODY', '올바른 JSON 요청이 필요합니다.');
  }
  const targetId = typeof body.targetId === 'string' ? body.targetId.trim() : '';
  if (!validUuid(targetId)) return apiError('INVALID_STAMP_TARGET', '유효한 targetId가 필요합니다.');
  if (body.artDirection !== undefined && typeof body.artDirection !== 'string') {
    return apiError('INVALID_ART_DIRECTION', 'artDirection은 문자열이어야 합니다.');
  }
  if (typeof body.artDirection === 'string' && body.artDirection.trim().length > 500) {
    return apiError('INVALID_ART_DIRECTION', 'artDirection은 500자 이하여야 합니다.');
  }

  const hourStart = new Date();
  hourStart.setMinutes(0, 0, 0);
  const { data: withinLimit, error: limitError } = await db.rpc('consume_api_rate_limit', {
    p_actor_key: 'admin:stamp-artwork',
    p_scope: 'stamp-artwork-generation',
    p_window_started_at: hourStart.toISOString(),
    p_limit: stampArtRateLimit()
  });
  if (limitError) return apiError('ART_RATE_LIMIT_UNAVAILABLE', '아트 생성 보호 기능을 확인하지 못했습니다.', 503);
  if (withinLimit !== true) return apiError('ART_RATE_LIMITED', '시간당 스탬프 아트 생성 한도를 초과했습니다.', 429);

  const { data: target, error: targetError } = await db
    .from('stamp_targets')
    .select('id, place_id, is_active, places!inner(id, content_id, name, category, description, overview)')
    .eq('id', targetId)
    .maybeSingle();
  if (targetError) return apiError('STAMP_TARGET_LOOKUP_FAILED', '스탬프 대상을 확인하지 못했습니다.', 503);
  if (!target?.is_active) return apiError('STAMP_TARGET_NOT_FOUND', '활성 스탬프 대상을 찾을 수 없습니다.', 404);

  const { data: latest, error: latestError } = await db
    .from('stamp_artworks')
    .select('id, version, status, created_at')
    .eq('stamp_target_id', targetId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) return apiError('STAMP_ARTWORK_LOOKUP_FAILED', '기존 아트 이력을 확인하지 못했습니다.', 503);
  if (latest && body.regenerate !== true) {
    return apiError('STAMP_ARTWORK_EXISTS', '기존 생성 이력이 있습니다. 재생성하려면 regenerate=true를 명시하세요.', 409);
  }
  if (latest && latest.status !== 'failed') {
    const elapsedSeconds = (Date.now() - new Date(String(latest.created_at)).getTime()) / 1000;
    const cooldown = stampArtCooldownSeconds();
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < cooldown) {
      return apiError('STAMP_ARTWORK_COOLDOWN', `같은 대상은 ${cooldown}초 후 다시 생성할 수 있습니다.`, 429);
    }
  }

  const placeRelation = Array.isArray(target.places) ? target.places[0] : target.places;
  if (!placeRelation) return apiError('STAMP_PLACE_NOT_FOUND', '연결된 관광지를 찾을 수 없습니다.', 409);
  const prompt = buildStampArtworkPrompt({
    placeName: String(placeRelation.name ?? '경주 관광지'),
    category: String(placeRelation.category ?? 'attraction'),
    description: String(placeRelation.overview || placeRelation.description || '경주 관광 명소'),
    artDirection: body.artDirection
  });
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-2';
  const version = Number(latest?.version ?? 0) + 1;
  const requestedBy = adminActor(authorization);
  const { data: artwork, error: insertError } = await db
    .from('stamp_artworks')
    .insert({
      stamp_target_id: targetId,
      version,
      status: 'generating',
      prompt,
      prompt_hash: contentHash(prompt),
      model,
      requested_by: requestedBy
    })
    .select('id')
    .single();
  if (insertError) {
    const code = insertError.code === '23505' ? 'STAMP_ARTWORK_IN_PROGRESS' : 'STAMP_ARTWORK_CREATE_FAILED';
    return apiError(code, '스탬프 아트 생성 작업을 시작하지 못했습니다.', insertError.code === '23505' ? 409 : 500);
  }

  let uploadedPath: string | null = null;
  let publicUrl = '';
  let generatedModel = model;
  try {
    const generated = await generateStampArtwork(prompt);
    generatedModel = generated.model;
    const storagePath = `${targetId}/v${version}-${artwork.id}.png`;
    const { error: uploadError } = await db.storage.from('stamp-artworks-staging').upload(
      storagePath,
      generated.bytes,
      { contentType: generated.mimeType, cacheControl: '31536000', upsert: false }
    );
    if (uploadError) throw new Error(`STAMP_ART_UPLOAD_FAILED: ${uploadError.message}`);
    uploadedPath = storagePath;
    const { error: updateError } = await db
      .from('stamp_artworks')
      .update({
        status: 'pending_review',
        storage_path: storagePath,
        public_url: null,
        mime_type: generated.mimeType,
        model: generated.model,
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', artwork.id);
    if (updateError) throw new Error(`STAMP_ART_UPDATE_FAILED: ${updateError.message}`);
    uploadedPath = null;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'unknown generation failure';
    if (uploadedPath) {
      const { error: cleanupError } = await db.storage.from('stamp-artworks-staging').remove([uploadedPath]);
      if (cleanupError) console.error('[stamps] artwork cleanup failed', cleanupError.message);
    }
    await db.from('stamp_artworks').update({
      status: 'failed',
      failure_reason: message,
      updated_at: new Date().toISOString()
    }).eq('id', artwork.id);
    console.error('[stamps] artwork generation failed', message);
    return apiError('STAMP_ARTWORK_GENERATION_FAILED', '스탬프 아트를 생성하거나 저장하지 못했습니다.', 502);
  }

  let status = 'pending_review';
  if (body.approve === true) {
    const approval = await approveArtwork(
      db,
      String(artwork.id),
      requestedBy,
      'Approved during authenticated generation request'
    );
    if (!approval.ok) {
      console.error('[stamps] artwork approval delayed', approval.message);
      return apiError(
        'STAMP_ARTWORK_APPROVAL_FAILED',
        '아트는 생성되어 검토 대기 중이지만 승인 처리하지 못했습니다. 다시 승인해 주세요.',
        503
      );
    }
    status = 'approved';
    publicUrl = approval.imageUrl;
  }

  return apiData({
    id: artwork.id,
    targetId,
    version,
    status,
    model: generatedModel,
    promptHash: contentHash(prompt),
    imageUrl: publicUrl || null
  }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: NextRequest) {
  if (!isMutationAllowed(request)) return apiError('ORIGIN_REJECTED', '허용되지 않은 요청 출처입니다.', 403);
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return apiError('ADMIN_UNAUTHORIZED', '관리자 인증이 필요합니다.', 401);
  const db = createSupabaseAdminClient();
  if (!db) return apiError('DATABASE_UNAVAILABLE', '스탬프 저장소가 설정되지 않았습니다.', 503);

  let body: ReviewBody;
  try {
    body = await request.json() as ReviewBody;
  } catch {
    return apiError('INVALID_BODY', '올바른 JSON 요청이 필요합니다.');
  }
  const artworkId = typeof body.artworkId === 'string' ? body.artworkId.trim() : '';
  if (!validUuid(artworkId)) return apiError('INVALID_STAMP_ARTWORK', '유효한 artworkId가 필요합니다.');
  if (body.action !== 'approve' && body.action !== 'reject') {
    return apiError('INVALID_REVIEW_ACTION', 'action은 approve 또는 reject여야 합니다.');
  }
  if (body.note !== undefined && typeof body.note !== 'string') {
    return apiError('INVALID_REVIEW_NOTE', 'note는 문자열이어야 합니다.');
  }
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 500) return apiError('INVALID_REVIEW_NOTE', 'note는 500자 이하여야 합니다.');
  const reviewedBy = adminActor(authorization);

  if (body.action === 'approve') {
    const approval = await approveArtwork(db, artworkId, reviewedBy, note || null);
    if (!approval.ok) {
      return apiError(
        approval.notReviewable ? 'STAMP_ARTWORK_NOT_REVIEWABLE' : 'STAMP_ARTWORK_REVIEW_FAILED',
        approval.notReviewable ? '검토 대기 중인 아트를 찾을 수 없습니다.' : '스탬프 아트를 승인하지 못했습니다.',
        approval.notReviewable ? 409 : 503
      );
    }
    return apiData({ id: artworkId, status: 'approved', imageUrl: approval.imageUrl }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const { data: pendingArtwork, error: pendingError } = await db
    .from('stamp_artworks')
    .select('storage_path')
    .eq('id', artworkId)
    .eq('status', 'pending_review')
    .maybeSingle();
  if (pendingError) return apiError('STAMP_ARTWORK_REVIEW_FAILED', '스탬프 아트를 확인하지 못했습니다.', 503);
  if (!pendingArtwork) return apiError('STAMP_ARTWORK_NOT_REVIEWABLE', '검토 대기 중인 아트를 찾을 수 없습니다.', 409);
  const { data: rejected, error } = await db
    .from('stamp_artworks')
    .update({
      status: 'rejected',
      reviewed_by: reviewedBy,
      review_note: note || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', artworkId)
    .eq('status', 'pending_review')
    .select('id')
    .maybeSingle();
  if (error) return apiError('STAMP_ARTWORK_REVIEW_FAILED', '스탬프 아트를 반려하지 못했습니다.', 503);
  if (!rejected) return apiError('STAMP_ARTWORK_NOT_REVIEWABLE', '검토 대기 중인 아트를 찾을 수 없습니다.', 409);
  if (pendingArtwork.storage_path) {
    const { error: cleanupError } = await db.storage
      .from('stamp-artworks-staging')
      .remove([String(pendingArtwork.storage_path)]);
    if (cleanupError) {
      console.error('[stamps] rejected artwork cleanup delayed', cleanupError.message);
      return apiError('STAMP_ARTWORK_CLEANUP_FAILED', '반려한 아트 파일 정리가 지연되었습니다.', 503);
    }
    await db.from('stamp_artworks')
      .update({ storage_path: null, public_url: null, updated_at: new Date().toISOString() })
      .eq('id', artworkId)
      .eq('status', 'rejected');
  }
  return apiData({ id: artworkId, status: 'rejected' }, { headers: { 'Cache-Control': 'private, no-store' } });
}

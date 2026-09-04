import { NextRequest } from 'next/server';
import { authorizeAdminRequest } from '@/backend/auth/admin';
import { apiData, apiError, isMutationAllowed } from '@/backend/http';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';
import { issueCheckpointToken, validUuid } from '@/backend/stamps';

type CheckpointBody = {
  targetId?: string;
  expiresInHours?: number;
  maxUses?: number;
  label?: string;
};

type CheckpointUpdateBody = {
  checkpointId?: string;
  active?: boolean;
};

function adminActor(authorization: Awaited<ReturnType<typeof authorizeAdminRequest>>): string {
  if (authorization.method === 'session') {
    return `session:${authorization.user?.email ?? authorization.user?.id ?? 'unknown'}`.slice(0, 160);
  }
  return 'admin-api-secret';
}

export async function GET(request: NextRequest) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return apiError('ADMIN_UNAUTHORIZED', '관리자 인증이 필요합니다.', 401);
  const db = createSupabaseAdminClient();
  if (!db) return apiError('DATABASE_UNAVAILABLE', '스탬프 저장소가 설정되지 않았습니다.', 503);
  const { data, error } = await db
    .from('stamp_checkpoint_tokens')
    .select('id, stamp_target_id, token_hint, label, is_active, expires_at, max_uses, uses_count, last_used_at, issued_by, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return apiError('CHECKPOINTS_READ_FAILED', '체크포인트 목록을 불러오지 못했습니다.', 500);
  return apiData(data ?? [], { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  if (!isMutationAllowed(request)) return apiError('ORIGIN_REJECTED', '허용되지 않은 요청 출처입니다.', 403);
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return apiError('ADMIN_UNAUTHORIZED', '관리자 인증이 필요합니다.', 401);
  const db = createSupabaseAdminClient();
  if (!db) return apiError('DATABASE_UNAVAILABLE', '스탬프 저장소가 설정되지 않았습니다.', 503);

  let body: CheckpointBody;
  try {
    body = await request.json() as CheckpointBody;
  } catch {
    return apiError('INVALID_BODY', '올바른 JSON 요청이 필요합니다.');
  }
  const targetId = typeof body.targetId === 'string' ? body.targetId.trim() : '';
  if (!validUuid(targetId)) return apiError('INVALID_STAMP_TARGET', '유효한 targetId가 필요합니다.');
  if (body.expiresInHours !== undefined && !Number.isInteger(body.expiresInHours)) {
    return apiError('INVALID_CHECKPOINT_EXPIRY', 'expiresInHours는 정수여야 합니다.');
  }
  if (body.maxUses !== undefined && !Number.isInteger(body.maxUses)) {
    return apiError('INVALID_CHECKPOINT_MAX_USES', 'maxUses는 정수여야 합니다.');
  }
  const expiresInHours = Number.isInteger(body.expiresInHours)
    ? Math.min(24 * 30, Math.max(1, Number(body.expiresInHours)))
    : 24 * 7;
  const maxUses = Number.isInteger(body.maxUses)
    ? Math.min(100000, Math.max(1, Number(body.maxUses)))
    : 5000;
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 160) : null;
  if (body.label !== undefined && typeof body.label !== 'string') {
    return apiError('INVALID_CHECKPOINT_LABEL', 'label은 문자열이어야 합니다.');
  }

  const { data: target, error: targetError } = await db
    .from('stamp_targets')
    .select('id, is_active, places!inner(content_id, name)')
    .eq('id', targetId)
    .maybeSingle();
  if (targetError) return apiError('STAMP_TARGET_LOOKUP_FAILED', '스탬프 대상을 확인하지 못했습니다.', 503);
  if (!target?.is_active) return apiError('STAMP_TARGET_NOT_FOUND', '활성 스탬프 대상을 찾을 수 없습니다.', 404);

  const issued = issueCheckpointToken();
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
  const { data: checkpoint, error: insertError } = await db
    .from('stamp_checkpoint_tokens')
    .insert({
      stamp_target_id: targetId,
      token_hash: issued.tokenHash,
      token_hint: issued.tokenHint,
      label,
      expires_at: expiresAt,
      max_uses: maxUses,
      issued_by: adminActor(authorization)
    })
    .select('id, token_hint, expires_at, max_uses')
    .single();
  if (insertError) return apiError('CHECKPOINT_CREATE_FAILED', '체크포인트를 발급하지 못했습니다.', 500);

  const placeRelation = Array.isArray(target.places) ? target.places[0] : target.places;
  let frontendBase = request.nextUrl.origin;
  try {
    if (process.env.FRONTEND_URL) frontendBase = new URL(process.env.FRONTEND_URL).origin;
  } catch {
    // The request origin remains the safe fallback in development.
  }
  const checkinUrl = new URL('/stamps', frontendBase);
  checkinUrl.searchParams.set('target', String(placeRelation?.content_id ?? ''));
  checkinUrl.searchParams.set('checkin', issued.token);

  return apiData({
    id: checkpoint.id,
    targetId,
    placeName: String(placeRelation?.name ?? '경주 관광지'),
    token: issued.token,
    tokenHint: checkpoint.token_hint,
    checkinUrl: checkinUrl.toString(),
    expiresAt: checkpoint.expires_at,
    maxUses: checkpoint.max_uses
  }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: NextRequest) {
  if (!isMutationAllowed(request)) return apiError('ORIGIN_REJECTED', '허용되지 않은 요청 출처입니다.', 403);
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return apiError('ADMIN_UNAUTHORIZED', '관리자 인증이 필요합니다.', 401);
  const db = createSupabaseAdminClient();
  if (!db) return apiError('DATABASE_UNAVAILABLE', '스탬프 저장소가 설정되지 않았습니다.', 503);

  let body: CheckpointUpdateBody;
  try {
    body = await request.json() as CheckpointUpdateBody;
  } catch {
    return apiError('INVALID_BODY', '올바른 JSON 요청이 필요합니다.');
  }
  const checkpointId = typeof body.checkpointId === 'string' ? body.checkpointId.trim() : '';
  if (!validUuid(checkpointId)) return apiError('INVALID_CHECKPOINT', '유효한 checkpointId가 필요합니다.');
  if (typeof body.active !== 'boolean') return apiError('INVALID_CHECKPOINT_STATE', 'active 값이 필요합니다.');

  const { data, error } = await db
    .from('stamp_checkpoint_tokens')
    .update({ is_active: body.active })
    .eq('id', checkpointId)
    .select('id, is_active')
    .maybeSingle();
  if (error) return apiError('CHECKPOINT_UPDATE_FAILED', '체크포인트 상태를 변경하지 못했습니다.', 503);
  if (!data) return apiError('CHECKPOINT_NOT_FOUND', '체크포인트를 찾을 수 없습니다.', 404);
  return apiData(data, { headers: { 'Cache-Control': 'private, no-store' } });
}

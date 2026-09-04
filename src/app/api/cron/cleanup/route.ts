import { timingSafeEqual } from 'node:crypto';
import { NextRequest } from 'next/server';
import { apiData, apiError } from '@/backend/http';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';

type Database = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type MediaRow = { id: string; staging_path: string | null; public_storage_path: string | null };

function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim() ?? '';
  const supplied = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (expected.length < 32 || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function removeMediaBatch(db: Database, rows: MediaRow[]): Promise<string | null> {
  const stagingPaths = rows.flatMap(row => row.staging_path ? [String(row.staging_path)] : []);
  const publicPaths = rows.flatMap(row => row.public_storage_path ? [String(row.public_storage_path)] : []);
  if (stagingPaths.length) {
    const { error } = await db.storage.from('community-staging').remove(stagingPaths);
    if (error) return error.message;
  }
  if (publicPaths.length) {
    const { error } = await db.storage.from('community-public').remove(publicPaths);
    if (error) return error.message;
  }
  if (rows.length) {
    const { error } = await db.from('community_media').delete().in('id', rows.map(row => row.id));
    if (error) return error.message;
  }
  return null;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return apiError('FORBIDDEN', '정리 작업 권한이 필요합니다.', 403);
  const db = createSupabaseAdminClient();
  if (!db) return apiError('DATABASE_UNAVAILABLE', '데이터베이스에 연결할 수 없습니다.', 503);

  const now = new Date().toISOString();
  const { data: expiredMedia, error: readError } = await db
    .from('community_media')
    .select('id, staging_path, public_storage_path')
    .eq('status', 'staged')
    .lt('expires_at', now)
    .limit(500);
  if (readError) return apiError('CLEANUP_SCAN_FAILED', readError.message, 500);
  const expiredRows = (expiredMedia ?? []).map(item => ({
    id: String(item.id),
    staging_path: item.staging_path ? String(item.staging_path) : null,
    public_storage_path: item.public_storage_path ? String(item.public_storage_path) : null
  }));
  const expiredCleanupError = await removeMediaBatch(db, expiredRows);
  if (expiredCleanupError) return apiError('CLEANUP_STORAGE_FAILED', expiredCleanupError, 500);

  const abandonedCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: abandonedMedia, error: abandonedError } = await db
    .from('community_media')
    .select('id, staging_path, public_storage_path')
    .eq('status', 'approved')
    .is('post_id', null)
    .lt('created_at', abandonedCutoff)
    .limit(500);
  if (abandonedError) return apiError('CLEANUP_SCAN_FAILED', abandonedError.message, 500);
  const abandonedRows = (abandonedMedia ?? []).map(item => ({
    id: String(item.id),
    staging_path: item.staging_path ? String(item.staging_path) : null,
    public_storage_path: item.public_storage_path ? String(item.public_storage_path) : null
  }));
  const abandonedCleanupError = await removeMediaBatch(db, abandonedRows);
  if (abandonedCleanupError) return apiError('CLEANUP_STORAGE_FAILED', abandonedCleanupError, 500);

  const rejectedCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rejectedMedia, error: rejectedError } = await db
    .from('community_media')
    .select('id, staging_path, public_storage_path')
    .in('status', ['rejected', 'expired'])
    .lt('created_at', rejectedCutoff)
    .limit(500);
  if (rejectedError) return apiError('CLEANUP_SCAN_FAILED', rejectedError.message, 500);
  const rejectedRows = (rejectedMedia ?? []).map(item => ({
    id: String(item.id),
    staging_path: item.staging_path ? String(item.staging_path) : null,
    public_storage_path: item.public_storage_path ? String(item.public_storage_path) : null
  }));
  const rejectedCleanupError = await removeMediaBatch(db, rejectedRows);
  if (rejectedCleanupError) return apiError('CLEANUP_STORAGE_FAILED', rejectedCleanupError, 500);

  const generatingCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { error: artworkRecoveryError } = await db
    .from('stamp_artworks')
    .update({
      status: 'failed',
      failure_reason: 'generation timed out before completion',
      updated_at: now
    })
    .eq('status', 'generating')
    .lt('created_at', generatingCutoff);
  if (artworkRecoveryError) return apiError('CLEANUP_ARTWORK_FAILED', artworkRecoveryError.message, 500);

  const { data: staleArtwork, error: artworkReadError } = await db
    .from('stamp_artworks')
    .select('id, storage_path')
    .in('status', ['rejected', 'failed'])
    .lt('updated_at', rejectedCutoff)
    .not('storage_path', 'is', null)
    .limit(500);
  if (artworkReadError) return apiError('CLEANUP_ARTWORK_FAILED', artworkReadError.message, 500);
  const artworkPaths = (staleArtwork ?? []).flatMap(item => item.storage_path ? [String(item.storage_path)] : []);
  if (artworkPaths.length) {
    const { error } = await db.storage.from('stamp-artworks-staging').remove(artworkPaths);
    if (error) return apiError('CLEANUP_ARTWORK_FAILED', error.message, 500);
    const { error: updateError } = await db.from('stamp_artworks')
      .update({ storage_path: null, public_url: null, updated_at: now })
      .in('id', (staleArtwork ?? []).map(item => String(item.id)));
    if (updateError) return apiError('CLEANUP_ARTWORK_FAILED', updateError.message, 500);
  }

  // Approval already removes the staging object; this is only a safety net for
  // approvals whose cleanup was delayed. `storage_path` doubles as the public
  // object key, so it cannot mark "staging already gone" — bound the window by
  // approved_at instead of re-issuing removes for every approved artwork forever.
  const approvedCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const approvedWindowStart = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data: approvedArtwork, error: approvedArtworkError } = await db
    .from('stamp_artworks')
    .select('storage_path')
    .eq('status', 'approved')
    .lt('approved_at', approvedCutoff)
    .gte('approved_at', approvedWindowStart)
    .not('storage_path', 'is', null)
    .limit(500);
  if (approvedArtworkError) return apiError('CLEANUP_ARTWORK_FAILED', approvedArtworkError.message, 500);
  const approvedStagingPaths = (approvedArtwork ?? []).flatMap(item => item.storage_path ? [String(item.storage_path)] : []);
  if (approvedStagingPaths.length) {
    const { error } = await db.storage.from('stamp-artworks-staging').remove(approvedStagingPaths);
    if (error) return apiError('CLEANUP_ARTWORK_FAILED', error.message, 500);
  }

  const { data: archivedArtwork, error: archivedArtworkError } = await db
    .from('stamp_artworks')
    .select('id, storage_path')
    .eq('status', 'archived')
    .lt('updated_at', rejectedCutoff)
    .not('storage_path', 'is', null)
    .limit(500);
  if (archivedArtworkError) return apiError('CLEANUP_ARTWORK_FAILED', archivedArtworkError.message, 500);
  const archivedPaths = (archivedArtwork ?? []).flatMap(item => item.storage_path ? [String(item.storage_path)] : []);
  if (archivedPaths.length) {
    const { error } = await db.storage.from('stamp-artworks').remove(archivedPaths);
    if (error) return apiError('CLEANUP_ARTWORK_FAILED', error.message, 500);
    const { error: updateError } = await db.from('stamp_artworks')
      .update({ storage_path: null, public_url: null, updated_at: now })
      .in('id', (archivedArtwork ?? []).map(item => String(item.id)));
    if (updateError) return apiError('CLEANUP_ARTWORK_FAILED', updateError.message, 500);
  }

  const { data, error } = await db.rpc('cleanup_expired_runtime_data');
  if (error) return apiError('CLEANUP_FAILED', error.message, 500);
  return apiData({
    stagedObjectsDeleted: expiredRows.length,
    abandonedMediaDeleted: abandonedRows.length,
    rejectedMediaDeleted: rejectedRows.length,
    staleArtworkDeleted: artworkPaths.length,
    approvedArtworkStagingDeleted: approvedStagingPaths.length,
    archivedArtworkDeleted: archivedPaths.length,
    database: data
  }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}

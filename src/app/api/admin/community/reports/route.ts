import { NextRequest } from 'next/server';
import { authorizeAdminRequest } from '@/backend/auth/admin';
import { apiData, apiError, isMutationAllowed, parseBody } from '@/backend/http';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';
import { readPostMediaObjects, removeCommunityMediaObjects } from '@/backend/community-media';

const statuses = new Set(['open', 'reviewing', 'resolved', 'dismissed']);

export async function GET(request: NextRequest) {
  const admin = await authorizeAdminRequest(request);
  if (!admin.authorized) return apiError('FORBIDDEN', '관리자 권한이 필요합니다.', 403);
  const db = createSupabaseAdminClient();
  if (!db) return apiError('DATABASE_UNAVAILABLE', '데이터베이스에 연결할 수 없습니다.', 503);
  const status = request.nextUrl.searchParams.get('status') || 'open';
  if (!statuses.has(status)) return apiError('INVALID_STATUS', '올바른 처리 상태가 필요합니다.', 400);

  const { data, error } = await db
    .from('community_reports')
    .select('id, post_id, comment_id, reason, detail, status, created_at, resolved_at, community_posts(title, content, author_name, status), community_comments(content, author_name, status)')
    .eq('status', status)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) return apiError('REPORT_QUEUE_FAILED', error.message, 500);
  return apiData(data ?? [], { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: NextRequest) {
  if (!isMutationAllowed(request)) return apiError('ORIGIN_REJECTED', '허용되지 않은 요청 출처입니다.', 403);
  const admin = await authorizeAdminRequest(request);
  if (!admin.authorized) return apiError('FORBIDDEN', '관리자 권한이 필요합니다.', 403);
  const db = createSupabaseAdminClient();
  if (!db) return apiError('DATABASE_UNAVAILABLE', '데이터베이스에 연결할 수 없습니다.', 503);

  const body = await parseBody<{ id?: string; status?: string; hideTarget?: boolean }>(request);
  const id = body?.id?.trim() ?? '';
  const status = body?.status?.trim() ?? '';
  if (!id || !statuses.has(status) || status === 'open') {
    return apiError('INVALID_REPORT_UPDATE', '신고 ID와 처리 상태가 필요합니다.', 400);
  }

  const { data: report } = await db
    .from('community_reports')
    .select('post_id, comment_id')
    .eq('id', id)
    .maybeSingle();
  if (!report) return apiError('REPORT_NOT_FOUND', '신고를 찾을 수 없습니다.', 404);

  if (body?.hideTarget) {
    if (report.post_id) {
      const mediaResult = await readPostMediaObjects(db, String(report.post_id));
      if (mediaResult.error) return apiError('TARGET_MEDIA_READ_FAILED', '신고 대상 파일을 확인하지 못했습니다.', 500);
      const storageError = await removeCommunityMediaObjects(db, mediaResult.media);
      if (storageError) return apiError('TARGET_MEDIA_DELETE_FAILED', '신고 대상 파일을 삭제하지 못했습니다.', 500);
      const { error } = await db.from('community_posts').update({ status: 'hidden' }).eq('id', report.post_id);
      if (error) return apiError('TARGET_HIDE_FAILED', error.message, 500);
    } else if (report.comment_id) {
      const { error } = await db.from('community_comments').update({ status: 'hidden' }).eq('id', report.comment_id);
      if (error) return apiError('TARGET_HIDE_FAILED', error.message, 500);
    }
  }

  const resolved = status === 'resolved' || status === 'dismissed';
  const { data, error } = await db
    .from('community_reports')
    .update({
      status,
      resolved_by: admin.user?.email || admin.method || 'admin',
      resolved_at: resolved ? new Date().toISOString() : null
    })
    .eq('id', id)
    .select('id, status, resolved_at')
    .single();
  if (error) return apiError('REPORT_UPDATE_FAILED', error.message, 500);
  return apiData(data, { headers: { 'Cache-Control': 'private, no-store' } });
}

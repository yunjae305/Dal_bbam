import { NextRequest } from 'next/server';
import {
  apiData,
  apiError,
  checkRateLimit,
  getUserDataContext,
  isErrorContext,
  isUuid,
  parseBody,
  rateLimitError
} from '@/backend/http';

type RouteContext = { params: Promise<{ id: string }> };
const reasons = new Set(['spam', 'harassment', 'privacy', 'illegal', 'misinformation', 'other']);
const noStore = { 'Cache-Control': 'private, no-store' };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const { id: postId } = await params;
  if (!isUuid(postId)) return apiError('POST_NOT_FOUND', '게시물을 찾을 수 없습니다.', 404);

  const body = await parseBody<{ reason?: string; detail?: string }>(request);
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reasons.has(reason)) return apiError('INVALID_REPORT', '신고 사유를 선택해 주세요.', 400);
  if (body?.detail !== undefined && body.detail !== null && typeof body.detail !== 'string') {
    return apiError('INVALID_REPORT', '신고 상세 내용 형식이 올바르지 않습니다.', 400);
  }
  const detail = typeof body?.detail === 'string' ? body.detail.trim().slice(0, 1000) || null : null;

  const rateLimit = await checkRateLimit(context, 'community-report', 5);
  if (rateLimit !== 'ok') return rateLimitError(rateLimit, '신고 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');

  const { data: post } = await context.db
    .from('community_posts')
    .select('actor_key')
    .eq('id', postId)
    .eq('status', 'published')
    .maybeSingle();
  if (!post) return apiError('POST_NOT_FOUND', '게시물을 찾을 수 없습니다.', 404);
  if (post.actor_key === context.user.actorKey) return apiError('SELF_REPORT', '본인 게시물은 신고할 수 없습니다.', 400);

  const { error } = await context.db.from('community_reports').insert({
    reporter_actor_key: context.user.actorKey,
    post_id: postId,
    reason,
    detail
  });
  if (error?.code === '23505') return apiData({ reported: true }, { headers: noStore });
  if (error) return apiError('REPORT_SAVE_FAILED', error.message, 500);
  return apiData({ reported: true }, { status: 201, headers: noStore });
}

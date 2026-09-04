import { NextRequest } from 'next/server';
import { apiData, apiError, getUserDataContext, isErrorContext, isUuid } from '@/backend/http';

type RouteContext = { params: Promise<{ id: string; commentId: string }> };

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const { id: postId, commentId } = await params;
  if (!isUuid(postId) || !isUuid(commentId)) {
    return apiError('COMMENT_NOT_FOUND', '본인 댓글을 찾을 수 없습니다.', 404);
  }

  const { data, error } = await context.db
    .from('community_comments')
    .update({ status: 'deleted', content: '삭제된 댓글입니다.', updated_at: new Date().toISOString() })
    .eq('id', commentId)
    .eq('post_id', postId)
    .eq('actor_key', context.user.actorKey)
    .select('id')
    .maybeSingle();
  if (error) return apiError('COMMENT_DELETE_FAILED', error.message, 500);
  if (!data) return apiError('COMMENT_NOT_FOUND', '본인 댓글을 찾을 수 없습니다.', 404);
  return apiData({ deleted: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}


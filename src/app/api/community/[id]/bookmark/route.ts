import { NextRequest } from 'next/server';
import { apiData, apiError, getUserDataContext, isErrorContext, parseBody } from '@/backend/http';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const { id } = await params;
  const body = await parseBody<{ bookmarked?: boolean }>(request);
  if (typeof body?.bookmarked !== 'boolean') return apiError('INVALID_BOOKMARK', 'bookmarked 값이 필요합니다.');

  if (body.bookmarked) {
    const { error } = await context.db
      .from('community_bookmarks')
      .upsert({ actor_key: context.user.actorKey, post_id: id }, { onConflict: 'actor_key,post_id' });
    if (error) return apiError('BOOKMARK_SAVE_FAILED', error.message, 500);
  } else {
    const { error } = await context.db
      .from('community_bookmarks')
      .delete()
      .eq('actor_key', context.user.actorKey)
      .eq('post_id', id);
    if (error) return apiError('BOOKMARK_DELETE_FAILED', error.message, 500);
  }

  return apiData({ bookmarked: body.bookmarked }, { headers: { 'Cache-Control': 'private, no-store' } });
}

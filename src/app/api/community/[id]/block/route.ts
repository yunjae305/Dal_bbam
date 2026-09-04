import { NextRequest } from 'next/server';
import { apiData, apiError, getUserDataContext, isErrorContext, isUuid } from '@/backend/http';

type RouteContext = { params: Promise<{ id: string }> };

async function targetActor(request: NextRequest, context: Awaited<ReturnType<typeof getUserDataContext>>, postId: string) {
  if (isErrorContext(context) || !isUuid(postId)) return null;
  const { data } = await context.db
    .from('community_posts')
    .select('actor_key')
    .eq('id', postId)
    .maybeSingle();
  return data?.actor_key ? String(data.actor_key) : null;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const { id: postId } = await params;
  const blockedActorKey = await targetActor(request, context, postId);
  if (!blockedActorKey) return apiError('POST_NOT_FOUND', '게시물을 찾을 수 없습니다.', 404);
  if (blockedActorKey === context.user.actorKey) return apiError('SELF_BLOCK', '본인은 차단할 수 없습니다.', 400);

  const { error } = await context.db.from('user_blocks').upsert({
    actor_key: context.user.actorKey,
    blocked_actor_key: blockedActorKey
  }, { onConflict: 'actor_key,blocked_actor_key' });
  if (error) return apiError('BLOCK_SAVE_FAILED', error.message, 500);
  return apiData({ blocked: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const { id: postId } = await params;
  const blockedActorKey = await targetActor(request, context, postId);
  if (!blockedActorKey) return apiError('POST_NOT_FOUND', '게시물을 찾을 수 없습니다.', 404);

  const { error } = await context.db.from('user_blocks')
    .delete()
    .eq('actor_key', context.user.actorKey)
    .eq('blocked_actor_key', blockedActorKey);
  if (error) return apiError('BLOCK_DELETE_FAILED', error.message, 500);
  return apiData({ blocked: false }, { headers: { 'Cache-Control': 'private, no-store' } });
}


import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { apiData, apiError, getUserDataContext, isErrorContext, type UserDataContext } from '@/backend/http';

type BlockRow = { blocked_actor_key: string; created_at: string };

/**
 * The block API keys blocks by post id, but a blocked author's posts are hidden, so a
 * block could never be undone. This route lists the traveler's own blocks and removes one.
 * Other travelers' actor keys never reach the browser: each block is exposed through a
 * handle derived from both keys, which only the blocker's own requests can resolve.
 */
function handleFor(actorKey: string, blockedActorKey: string): string {
  return createHash('sha256').update(`${actorKey}\n${blockedActorKey}`).digest('base64url').slice(0, 22);
}

async function ownBlocks(context: UserDataContext) {
  return context.db
    .from('user_blocks')
    .select('blocked_actor_key, created_at')
    .eq('actor_key', context.user.actorKey)
    .order('created_at', { ascending: false })
    .limit(200);
}

export async function GET(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;

  const { data, error } = await ownBlocks(context);
  if (error) return apiError('BLOCKS_LOAD_FAILED', '차단 목록을 불러오지 못했습니다.', 503);

  const blocks = await Promise.all(((data ?? []) as BlockRow[]).map(async row => {
    const { data: latest } = await context.db
      .from('community_posts')
      .select('author_name')
      .eq('actor_key', row.blocked_actor_key)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      id: handleFor(context.user.actorKey, row.blocked_actor_key),
      name: typeof latest?.author_name === 'string' && latest.author_name.trim() ? latest.author_name : null,
      blockedAt: row.created_at
    };
  }));
  return apiData(blocks, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function DELETE(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;

  const handle = request.nextUrl.searchParams.get('id')?.trim() ?? '';
  if (!/^[A-Za-z0-9_-]{22}$/.test(handle)) return apiError('INVALID_BLOCK', '차단 항목이 올바르지 않습니다.');

  const { data, error } = await ownBlocks(context);
  if (error) return apiError('BLOCKS_LOAD_FAILED', '차단 목록을 불러오지 못했습니다.', 503);
  const match = ((data ?? []) as BlockRow[]).find(row => handleFor(context.user.actorKey, row.blocked_actor_key) === handle);
  if (!match) return apiError('BLOCK_NOT_FOUND', '차단 항목을 찾을 수 없습니다.', 404);

  const { error: deleteError } = await context.db
    .from('user_blocks')
    .delete()
    .eq('actor_key', context.user.actorKey)
    .eq('blocked_actor_key', match.blocked_actor_key);
  if (deleteError) return apiError('BLOCK_DELETE_FAILED', '차단을 해제하지 못했습니다.', 500);
  return apiData({ blocked: false }, { headers: { 'Cache-Control': 'private, no-store' } });
}

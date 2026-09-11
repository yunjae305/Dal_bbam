import { getCurrentUser } from '@/backend/auth/current-user';
import { buildCommunitySelect, mapCommunityPost } from '@/backend/community';
import { isFeatureEnabled } from '@/backend/features';
import { apiData, apiError } from '@/backend/http';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';

/** A story is derived from an explicitly published photo post, never a private draft. */
export async function GET() {
  if (!isFeatureEnabled('community')) return apiError('FEATURE_DISABLED', '커뮤니티 기능이 비활성화되어 있습니다.', 503);
  const db = createSupabaseAdminClient();
  if (!db) return apiError('DATABASE_UNAVAILABLE', '데이터베이스가 설정되지 않았습니다.', 503);
  const user = await getCurrentUser();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db.from('community_posts')
    .select(buildCommunitySelect({ placeInner: true, mediaInner: true }))
    .eq('status', 'published')
    .eq('places.category', 'heritage')
    .eq('community_media.status', 'approved')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) return apiError('STORIES_UNAVAILABLE', '방문자 이야기를 불러오지 못했습니다.', 503);

  let rows = data ?? [];
  if (user) {
    const { data: blocks, error: blockError } = await db.from('user_blocks')
      .select('blocked_actor_key').eq('actor_key', user.actorKey);
    if (blockError) return apiError('STORIES_UNAVAILABLE', '방문자 이야기를 불러오지 못했습니다.', 503);
    const blocked = new Set((blocks ?? []).map(row => String(row.blocked_actor_key)));
    rows = rows.filter(row => !blocked.has(String((row as { actor_key?: string }).actor_key)));
  }
  const stories = rows.map(row => mapCommunityPost(row as never, user?.actorKey))
    .filter(post => post.mediaUrls.length > 0)
    .map(post => ({ ...post, content: post.content.slice(0, 280) }));
  return apiData(stories, {
    meta: { since, count: stories.length },
    headers: { 'Cache-Control': user ? 'private, no-store' : 'public, s-maxage=30' }
  });
}

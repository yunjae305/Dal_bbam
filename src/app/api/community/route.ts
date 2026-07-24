import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/backend/auth/current-user';
import { communitySelect, mapCommunityPost } from '@/backend/community';
import {
  apiData,
  apiError,
  getUserDataContext,
  isErrorContext,
  parseBody,
  resolvePlaceId
} from '@/backend/http';
import { moderateContent } from '@/backend/openai';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';
import { isFeatureEnabled } from '@/backend/features';

const categories = ['review', 'tip', 'food', 'lodging'] as const;
type CommunityCategory = (typeof categories)[number];
type PostBody = {
  category?: CommunityCategory;
  contentId?: string;
  title?: string;
  content?: string;
  rating?: number;
  mediaIds?: string[];
};

export async function GET(request: NextRequest) {
  if (!isFeatureEnabled('community')) return apiError('FEATURE_DISABLED', '커뮤니티 기능이 비활성화되어 있습니다.', 503);
  const db = createSupabaseAdminClient();
  if (!db) return apiError('DATABASE_UNAVAILABLE', '데이터베이스가 설정되지 않았습니다.', 503);
  const user = await getCurrentUser();
  const category = request.nextUrl.searchParams.get('category');
  const contentId = request.nextUrl.searchParams.get('contentId');
  const bookmarked = request.nextUrl.searchParams.get('bookmarked') === 'true';

  let query = db
    .from('community_posts')
    .select(communitySelect)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(100);
  if (categories.includes(category as CommunityCategory)) query = query.eq('category', category);
  if (contentId) query = query.eq('places.content_id', contentId);
  if (bookmarked && user) query = query.eq('community_bookmarks.actor_key', user.actorKey);

  const { data, error } = await query;
  if (error) return apiError('COMMUNITY_READ_FAILED', error.message, 500);
  return apiData(
    (data ?? []).map(row => mapCommunityPost(row as never, user?.actorKey)),
    { headers: { 'Cache-Control': user ? 'private, no-store' : 'public, s-maxage=60' } }
  );
}

export async function POST(request: NextRequest) {
  if (!isFeatureEnabled('community')) return apiError('FEATURE_DISABLED', '커뮤니티 기능이 비활성화되어 있습니다.', 503);
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const body = await parseBody<PostBody>(request);
  if (!body?.title?.trim() || !body.content?.trim() || !body.category || !categories.includes(body.category)) {
    return apiError('INVALID_POST', '카테고리, 제목, 내용이 필요합니다.');
  }
  if (body.rating !== undefined && (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5)) {
    return apiError('INVALID_RATING', '별점은 1~5 사이여야 합니다.');
  }

  let moderation;
  try {
    moderation = await moderateContent({ text: `${body.title}\n${body.content}` });
  } catch {
    return apiError('MODERATION_UNAVAILABLE', '안전 검사를 완료할 수 없어 게시하지 않았습니다.', 503);
  }
  if (!moderation.allowed) {
    return apiError('MODERATION_REJECTED', '안전 또는 개인정보 검사를 통과하지 못했습니다.', 422, {
      categories: moderation.categories
    });
  }

  const placeId = body.contentId ? await resolvePlaceId(context.db, body.contentId) : null;
  if (body.contentId && !placeId) return apiError('PLACE_NOT_FOUND', '연결할 관광지를 찾을 수 없습니다.', 404);

  const mediaIds = Array.from(new Set(body.mediaIds ?? [])).slice(0, 5);
  if (mediaIds.length) {
    const { data: media } = await context.db
      .from('community_media')
      .select('id')
      .in('id', mediaIds)
      .eq('actor_key', context.user.actorKey)
      .eq('status', 'approved');
    if ((media ?? []).length !== mediaIds.length) {
      return apiError('MEDIA_NOT_APPROVED', '검사를 통과한 본인 사진만 게시할 수 있습니다.', 422);
    }
  }

  const { data, error } = await context.db
    .from('community_posts')
    .insert({
      actor_key: context.user.actorKey,
      author_name: context.user.name || '여행자',
      category: body.category,
      place_id: placeId,
      title: body.title.trim().slice(0, 120),
      content: body.content.trim().slice(0, 5000),
      rating: body.rating ?? null,
      status: 'published',
      moderation: { categories: moderation.categories }
    })
    .select('id')
    .single();
  if (error || !data) return apiError('POST_SAVE_FAILED', error?.message ?? '게시물을 저장할 수 없습니다.', 500);

  if (mediaIds.length) {
    await context.db
      .from('community_media')
      .update({ post_id: data.id })
      .in('id', mediaIds)
      .eq('actor_key', context.user.actorKey)
      .eq('status', 'approved');
  }

  const { data: post, error: readError } = await context.db
    .from('community_posts')
    .select(communitySelect)
    .eq('id', data.id)
    .single();
  if (readError) return apiError('POST_READ_FAILED', readError.message, 500);
  return apiData(mapCommunityPost(post as never, context.user.actorKey), {
    status: 201,
    headers: { 'Cache-Control': 'private, no-store' }
  });
}

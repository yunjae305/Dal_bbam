import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/backend/auth/current-user';
import { buildCommunitySelect, communitySelect, mapCommunityPost } from '@/backend/community';
import {
  apiData,
  apiError,
  checkRateLimit,
  getUserDataContext,
  isConnectionFailure,
  isErrorContext,
  parseBody,
  rateLimitError,
  resolvePlaceId
} from '@/backend/http';
import { moderateContent } from '@/backend/openai';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';
import { isFeatureEnabled } from '@/backend/features';
import { placeCategories, type PlaceCategory } from '@/shared/types';

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

const COMMUNITY_UNAVAILABLE_MESSAGE = '커뮤니티 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.';

export async function GET(request: NextRequest) {
  if (!isFeatureEnabled('community')) return apiError('FEATURE_DISABLED', '커뮤니티 기능이 비활성화되어 있습니다.', 503);
  const db = createSupabaseAdminClient();
  if (!db) return apiError('DATABASE_UNAVAILABLE', '데이터베이스가 설정되지 않았습니다.', 503);
  const user = await getCurrentUser();
  const category = request.nextUrl.searchParams.get('category');
  const contentId = request.nextUrl.searchParams.get('contentId');
  const region = (request.nextUrl.searchParams.get('region') ?? '').trim().slice(0, 60);
  const placeCategory = request.nextUrl.searchParams.get('placeCategory');
  if (placeCategory && !placeCategories.includes(placeCategory as PlaceCategory)) {
    return apiError('INVALID_CATEGORY', '장소 카테고리가 올바르지 않습니다.');
  }
  const bookmarked = request.nextUrl.searchParams.get('bookmarked') === 'true';
  if (bookmarked && !user) return apiError('UNAUTHENTICATED', '로그인이 필요합니다.', 401);

  let query = db
    .from('community_posts')
    .select(buildCommunitySelect({ placeInner: Boolean(contentId || region || placeCategory), bookmarkInner: bookmarked && Boolean(user) }))
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(100);
  if (categories.includes(category as CommunityCategory)) query = query.eq('category', category);
  if (contentId) query = query.eq('places.content_id', contentId);
  if (region) query = query.ilike('places.address', `%${region.replace(/[\\%_]/g, '\\$&')}%`);
  if (placeCategory) query = query.eq('places.category', placeCategory);
  if (bookmarked && user) query = query.eq('community_bookmarks.actor_key', user.actorKey);

  const { data, error } = await query;
  if (error) {
    console.error('[community] feed read failed', error.message);
    if (isConnectionFailure(error)) return apiError('COMMUNITY_UNAVAILABLE', COMMUNITY_UNAVAILABLE_MESSAGE, 503);
    return apiError('COMMUNITY_READ_FAILED', '게시물을 불러오지 못했습니다.', 500);
  }
  let rows = data ?? [];
  if (user) {
    const { data: blockedRows } = await db
      .from('user_blocks')
      .select('blocked_actor_key')
      .eq('actor_key', user.actorKey);
    const blocked = new Set((blockedRows ?? []).map(row => String(row.blocked_actor_key)));
    rows = rows.filter(row => !blocked.has(String((row as { actor_key?: string }).actor_key)));
  }
  return apiData(
    rows.map(row => mapCommunityPost(row as never, user?.actorKey)),
    { headers: { 'Cache-Control': user ? 'private, no-store' : 'public, s-maxage=60' } }
  );
}

export async function POST(request: NextRequest) {
  if (!isFeatureEnabled('community')) return apiError('FEATURE_DISABLED', '커뮤니티 기능이 비활성화되어 있습니다.', 503);
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;

  const body = await parseBody<PostBody>(request);
  if (
    !body ||
    typeof body.title !== 'string' || !body.title.trim() ||
    typeof body.content !== 'string' || !body.content.trim() ||
    typeof body.category !== 'string' || !categories.includes(body.category)
  ) {
    return apiError('INVALID_POST', '카테고리, 제목, 내용이 필요합니다.');
  }
  if (body.contentId !== undefined && (typeof body.contentId !== 'string' || !body.contentId.trim())) {
    return apiError('INVALID_POST', '연결할 관광지 ID 형식이 올바르지 않습니다.');
  }
  if (body.mediaIds !== undefined && (!Array.isArray(body.mediaIds) || body.mediaIds.some(id => typeof id !== 'string'))) {
    return apiError('INVALID_POST', '사진 목록 형식이 올바르지 않습니다.');
  }
  if (body.rating !== undefined && (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5)) {
    return apiError('INVALID_RATING', '별점은 1~5 사이여야 합니다.');
  }
  if ((body.category === 'food' || body.category === 'lodging') && (!body.contentId || body.rating === undefined)) {
    return apiError('REVIEW_PLACE_REQUIRED', '맛집·숙소 평가에는 방문한 장소와 별점이 필요합니다.');
  }

  const rateLimit = await checkRateLimit(context, 'community-post', 5);
  if (rateLimit !== 'ok') return rateLimitError(rateLimit, '게시 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');

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

  const placeId = body.contentId ? await resolvePlaceId(context.db, body.contentId.trim()) : null;
  if (body.contentId && !placeId) return apiError('PLACE_NOT_FOUND', '연결할 관광지를 찾을 수 없습니다.', 404);
  if (placeId && (body.category === 'food' || body.category === 'lodging')) {
    const { data: place } = await context.db.from('places').select('category').eq('id', placeId).maybeSingle();
    if (place?.category !== body.category) return apiError('INVALID_REVIEW_PLACE', '평가 종류와 방문한 장소가 일치하지 않습니다.');
  }

  const mediaIds = Array.from(new Set(body.mediaIds ?? [])).slice(0, 5);
  if (mediaIds.length) {
    const { data: media } = await context.db
      .from('community_media')
      .select('id')
      .in('id', mediaIds)
      .eq('actor_key', context.user.actorKey)
      .eq('status', 'approved')
      .is('post_id', null);
    if ((media ?? []).length !== mediaIds.length) {
      return apiError('MEDIA_NOT_APPROVED', '검사를 통과한 본인 사진만 게시할 수 있습니다.', 422);
    }
  }

  // Tips carry no rating; mirror the PATCH rule so a tip can never store one.
  const rating = body.category === 'tip' ? null : body.rating ?? null;

  const { data: postId, error } = await context.db.rpc('create_community_post', {
    p_actor_key: context.user.actorKey,
    p_author_name: context.user.name || '여행자',
    p_category: body.category,
    p_place_id: placeId,
    p_title: body.title.trim().slice(0, 120),
    p_content: body.content.trim().slice(0, 5000),
    p_rating: rating,
    p_moderation: { categories: moderation.categories },
    p_media_ids: mediaIds
  });
  if (error || !postId) {
    const mediaConflict = error?.message?.includes('media_');
    return apiError(
      mediaConflict ? 'MEDIA_NOT_APPROVED' : 'POST_SAVE_FAILED',
      mediaConflict ? '이미 사용됐거나 승인되지 않은 사진이 포함되어 있습니다.' : '게시물을 저장할 수 없습니다.',
      mediaConflict ? 409 : 500
    );
  }

  const { data: post, error: readError } = await context.db
    .from('community_posts')
    .select(communitySelect)
    .eq('id', String(postId))
    .single();
  if (readError) return apiError('POST_READ_FAILED', readError.message, 500);
  return apiData(mapCommunityPost(post as never, context.user.actorKey), {
    status: 201,
    headers: { 'Cache-Control': 'private, no-store' }
  });
}

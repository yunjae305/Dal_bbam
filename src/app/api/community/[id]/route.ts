import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/backend/auth/current-user';
import { communitySelect, mapCommunityPost } from '@/backend/community';
import {
  apiData,
  apiError,
  checkRateLimit,
  getUserDataContext,
  isConnectionFailure,
  isErrorContext,
  isUuid,
  parseBody,
  rateLimitError,
  resolvePlaceId
} from '@/backend/http';
import { moderateContent } from '@/backend/openai';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';
import { readPostMediaObjects, removeCommunityMediaObjects } from '@/backend/community-media';

type RouteContext = { params: Promise<{ id: string }> };
const categories = ['review', 'tip', 'food', 'lodging'] as const;
type CommunityCategory = (typeof categories)[number];
type PatchBody = {
  category?: CommunityCategory;
  title?: string;
  content?: string;
  rating?: number | null;
  contentId?: string | null;
};

const COMMUNITY_UNAVAILABLE_MESSAGE = '커뮤니티 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.';
const postNotFound = () => apiError('POST_NOT_FOUND', '게시물을 찾을 수 없습니다.', 404);
const ownPostNotFound = () => apiError('POST_NOT_FOUND', '본인 게시물을 찾을 수 없습니다.', 404);

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const db = createSupabaseAdminClient();
  if (!db) return apiError('DATABASE_UNAVAILABLE', '데이터베이스가 설정되지 않았습니다.', 503);
  const { id } = await params;
  if (!isUuid(id)) return postNotFound();
  const user = await getCurrentUser();

  const { data, error } = await db
    .from('community_posts')
    .select(communitySelect)
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle();

  if (error) {
    console.error('[community] post read failed', error.message);
    if (isConnectionFailure(error)) return apiError('COMMUNITY_UNAVAILABLE', COMMUNITY_UNAVAILABLE_MESSAGE, 503);
    return apiError('POST_READ_FAILED', '게시물을 불러오지 못했습니다.', 500);
  }
  if (!data) return postNotFound();
  if (user) {
    const { data: blocked } = await db
      .from('user_blocks')
      .select('actor_key')
      .eq('actor_key', user.actorKey)
      .eq('blocked_actor_key', String((data as { actor_key?: string }).actor_key))
      .maybeSingle();
    if (blocked) return postNotFound();
  }
  return apiData(mapCommunityPost(data as never, user?.actorKey), {
    headers: { 'Cache-Control': user ? 'private, no-store' : 'public, s-maxage=60' }
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const { id } = await params;
  if (!isUuid(id)) return ownPostNotFound();
  const body = await parseBody<PatchBody>(request);
  if (!body || typeof body !== 'object') return apiError('INVALID_BODY', '올바른 JSON 요청이 필요합니다.');
  if (body.category !== undefined && !categories.includes(body.category)) {
    return apiError('INVALID_CATEGORY', '올바른 카테고리가 필요합니다.');
  }
  if (body.title !== undefined && typeof body.title !== 'string') {
    return apiError('INVALID_BODY', '제목 형식이 올바르지 않습니다.');
  }
  if (body.content !== undefined && typeof body.content !== 'string') {
    return apiError('INVALID_BODY', '내용 형식이 올바르지 않습니다.');
  }
  if (body.contentId !== undefined && body.contentId !== null && (typeof body.contentId !== 'string' || !body.contentId.trim())) {
    return apiError('INVALID_BODY', '장소 ID가 올바르지 않습니다.');
  }
  const ratingSupplied = Object.prototype.hasOwnProperty.call(body, 'rating');
  if (ratingSupplied && body.rating !== null && (!Number.isInteger(body.rating) || Number(body.rating) < 1 || Number(body.rating) > 5)) {
    return apiError('INVALID_RATING', '별점은 1~5 사이여야 합니다.');
  }

  const rateLimit = await checkRateLimit(context, 'community-post-edit', 10);
  if (rateLimit !== 'ok') return rateLimitError(rateLimit, '수정 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');

  const { data: owned } = await context.db
    .from('community_posts')
    .select('category, title, content, rating, place_id')
    .eq('id', id)
    .eq('actor_key', context.user.actorKey)
    .maybeSingle();
  if (!owned) return ownPostNotFound();

  const category = body.category ?? owned.category as CommunityCategory;
  if (!categories.includes(category)) {
    return apiError('INVALID_CATEGORY', '올바른 카테고리가 필요합니다.');
  }
  const title = body.title?.trim() || String(owned.title);
  const content = body.content?.trim() || String(owned.content);
  const rating = category === 'tip' ? null : ratingSupplied ? body.rating : owned.rating;
  const placeSupplied = Object.prototype.hasOwnProperty.call(body, 'contentId');
  const placeId = placeSupplied ? (body.contentId ? await resolvePlaceId(context.db, body.contentId.trim()) : null) : owned.place_id;
  if (body.contentId && !placeId) return apiError('PLACE_NOT_FOUND', '연결할 관광지를 찾을 수 없습니다.', 404);
  if (category === 'food' || category === 'lodging') {
    if (!placeId || rating == null) return apiError('REVIEW_PLACE_REQUIRED', '맛집·숙소 평가에는 방문한 장소와 별점이 필요합니다.');
    const { data: place } = await context.db.from('places').select('category').eq('id', placeId).maybeSingle();
    if (place?.category !== category) return apiError('INVALID_REVIEW_PLACE', '평가 종류와 방문한 장소가 일치하지 않습니다.');
  }
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    return apiError('INVALID_RATING', '별점은 1~5 사이여야 합니다.');
  }

  let moderation;
  try {
    moderation = await moderateContent({ text: `${title}\n${content}` });
  } catch {
    return apiError('MODERATION_UNAVAILABLE', '안전 검사를 완료할 수 없어 수정하지 않았습니다.', 503);
  }
  if (!moderation.allowed) {
    return apiError('MODERATION_REJECTED', '안전 또는 개인정보 검사를 통과하지 못했습니다.', 422);
  }

  const { data, error } = await context.db
    .from('community_posts')
    .update({
      category,
      ...(placeSupplied ? { place_id: placeId } : {}),
      title: title.slice(0, 120),
      content: content.slice(0, 5000),
      rating,
      moderation: { categories: moderation.categories },
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('actor_key', context.user.actorKey)
    .select(communitySelect)
    .single();
  if (error) return apiError('POST_UPDATE_FAILED', error.message, 500);
  return apiData(mapCommunityPost(data as never, context.user.actorKey), {
    headers: { 'Cache-Control': 'private, no-store' }
  });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const { id } = await params;
  if (!isUuid(id)) return ownPostNotFound();

  // Snapshot the storage objects, delete the database rows (the authoritative
  // record), then clean up storage. A storage failure is logged but never
  // resurrects a post that the user has already deleted.
  const mediaResult = await readPostMediaObjects(context.db, id, context.user.actorKey);
  if (mediaResult.error) {
    return apiError('POST_MEDIA_READ_FAILED', '게시물 파일을 확인하지 못했습니다.', 500);
  }

  const { data, error } = await context.db
    .from('community_posts')
    .delete()
    .eq('id', id)
    .eq('actor_key', context.user.actorKey)
    .select('id')
    .maybeSingle();
  if (error) return apiError('POST_DELETE_FAILED', error.message, 500);
  if (!data) return ownPostNotFound();

  const storageError = await removeCommunityMediaObjects(context.db, mediaResult.media);
  if (storageError) {
    console.error('[community] post media cleanup failed after delete', { postId: id, error: storageError });
  }
  return apiData({ deleted: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}

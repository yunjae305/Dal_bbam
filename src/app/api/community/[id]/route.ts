import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/backend/auth/current-user';
import { communitySelect, mapCommunityPost } from '@/backend/community';
import {
  apiData,
  apiError,
  getUserDataContext,
  isErrorContext,
  parseBody
} from '@/backend/http';
import { moderateContent } from '@/backend/openai';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';

type RouteContext = { params: Promise<{ id: string }> };
const categories = ['review', 'tip', 'food', 'lodging'] as const;
type CommunityCategory = (typeof categories)[number];
type PatchBody = {
  category?: CommunityCategory;
  title?: string;
  content?: string;
  rating?: number | null;
};

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const db = createSupabaseAdminClient();
  if (!db) return apiError('DATABASE_UNAVAILABLE', '데이터베이스가 설정되지 않았습니다.', 503);
  const user = await getCurrentUser();
  const { id } = await params;

  const { data, error } = await db
    .from('community_posts')
    .select(communitySelect)
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle();

  if (error) return apiError('POST_READ_FAILED', error.message, 500);
  if (!data) return apiError('POST_NOT_FOUND', '게시물을 찾을 수 없습니다.', 404);
  return apiData(mapCommunityPost(data as never, user?.actorKey), {
    headers: { 'Cache-Control': user ? 'private, no-store' : 'public, s-maxage=60' }
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const { id } = await params;
  const body = await parseBody<PatchBody>(request);
  if (!body) return apiError('INVALID_BODY', '올바른 JSON 요청이 필요합니다.');

  const { data: owned } = await context.db
    .from('community_posts')
    .select('category, title, content, rating')
    .eq('id', id)
    .eq('actor_key', context.user.actorKey)
    .maybeSingle();
  if (!owned) return apiError('POST_NOT_FOUND', '본인 게시물을 찾을 수 없습니다.', 404);

  const category = body.category ?? owned.category as CommunityCategory;
  if (!categories.includes(category)) {
    return apiError('INVALID_CATEGORY', '올바른 카테고리가 필요합니다.');
  }
  const title = body.title?.trim() || String(owned.title);
  const content = body.content?.trim() || String(owned.content);
  const ratingSupplied = Object.prototype.hasOwnProperty.call(body, 'rating');
  const rating = category === 'tip' ? null : ratingSupplied ? body.rating : owned.rating;
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

  const { data, error } = await context.db
    .from('community_posts')
    .delete()
    .eq('id', id)
    .eq('actor_key', context.user.actorKey)
    .select('id')
    .maybeSingle();
  if (error) return apiError('POST_DELETE_FAILED', error.message, 500);
  if (!data) return apiError('POST_NOT_FOUND', '본인 게시물을 찾을 수 없습니다.', 404);
  return apiData({ deleted: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}

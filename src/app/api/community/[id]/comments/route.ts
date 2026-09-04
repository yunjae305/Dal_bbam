import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/backend/auth/current-user';
import {
  apiData,
  apiError,
  checkRateLimit,
  getUserDataContext,
  isConnectionFailure,
  isErrorContext,
  isUuid,
  parseBody,
  rateLimitError
} from '@/backend/http';
import { moderateContent } from '@/backend/openai';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';

type RouteContext = { params: Promise<{ id: string }> };

const postNotFound = () => apiError('POST_NOT_FOUND', '게시물을 찾을 수 없습니다.', 404);

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const db = createSupabaseAdminClient();
  if (!db) return apiError('DATABASE_UNAVAILABLE', '데이터베이스에 연결할 수 없습니다.', 503);
  const { id: postId } = await params;
  if (!isUuid(postId)) return postNotFound();
  const user = await getCurrentUser();

  const { data, error } = await db
    .from('community_comments')
    .select('id, actor_key, author_name, content, created_at, updated_at')
    .eq('post_id', postId)
    .eq('status', 'published')
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) {
    console.error('[community] comments read failed', error.message);
    if (isConnectionFailure(error)) {
      return apiError('COMMUNITY_UNAVAILABLE', '커뮤니티 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.', 503);
    }
    return apiError('COMMENTS_READ_FAILED', '댓글을 불러오지 못했습니다.', 500);
  }

  let blocked = new Set<string>();
  if (user) {
    const { data: rows } = await db
      .from('user_blocks')
      .select('blocked_actor_key')
      .eq('actor_key', user.actorKey);
    blocked = new Set((rows ?? []).map(row => String(row.blocked_actor_key)));
  }

  return apiData((data ?? [])
    .filter(row => !blocked.has(String(row.actor_key)))
    .map(row => ({
      id: String(row.id),
      authorName: String(row.author_name),
      content: String(row.content),
      isOwner: Boolean(user && row.actor_key === user.actorKey),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    })), { headers: { 'Cache-Control': user ? 'private, no-store' : 'public, s-maxage=30' } });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const { id: postId } = await params;
  if (!isUuid(postId)) return postNotFound();

  const body = await parseBody<{ content?: string }>(request);
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (!content || content.length > 1000) {
    return apiError('INVALID_COMMENT', '댓글은 1~1000자로 입력해 주세요.', 400);
  }

  const rateLimit = await checkRateLimit(context, 'community-comment', 10);
  if (rateLimit !== 'ok') return rateLimitError(rateLimit, '댓글 작성 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');

  const { data: post } = await context.db
    .from('community_posts')
    .select('id')
    .eq('id', postId)
    .eq('status', 'published')
    .maybeSingle();
  if (!post) return postNotFound();

  let moderation;
  try {
    moderation = await moderateContent({ text: content });
  } catch {
    return apiError('MODERATION_UNAVAILABLE', '안전 검사를 완료할 수 없어 댓글을 게시하지 않았습니다.', 503);
  }
  if (!moderation.allowed) {
    return apiError('MODERATION_REJECTED', '안전 또는 개인정보 검사를 통과하지 못했습니다.', 422);
  }

  const { data, error } = await context.db
    .from('community_comments')
    .insert({
      post_id: postId,
      actor_key: context.user.actorKey,
      author_name: context.user.name || '여행자',
      content,
      status: 'published'
    })
    .select('id, author_name, content, created_at, updated_at')
    .single();
  if (error || !data) return apiError('COMMENT_SAVE_FAILED', error?.message ?? '댓글을 저장하지 못했습니다.', 500);

  return apiData({
    id: String(data.id),
    authorName: String(data.author_name),
    content: String(data.content),
    isOwner: true,
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at)
  }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}


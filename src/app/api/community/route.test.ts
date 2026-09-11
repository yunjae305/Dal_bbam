import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getCurrentUser = vi.fn();
const createSupabaseAdminClient = vi.fn();
const moderateContent = vi.fn();

vi.mock('@/backend/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient }));
vi.mock('@/backend/openai', () => ({ moderateContent }));

type Result = { data: unknown; error: unknown };

/** Awaitable PostgREST-style builder: every filter returns the chain itself. */
function queryChain(result: Result) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.ilike = vi.fn(self);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.order = vi.fn(self);
  chain.limit = vi.fn(self);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.then = (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain as Record<string, ReturnType<typeof vi.fn>>;
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/community', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

describe('community collection route', () => {
  const actor = { id: 'user-1', name: '여행자', provider: 'demo', actorKey: 'demo:user-1' };

  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(actor);
  });

  describe('GET', () => {
    it('requires a login for the bookmarked feed instead of returning the public feed', async () => {
      getCurrentUser.mockResolvedValue(null);
      const from = vi.fn();
      createSupabaseAdminClient.mockReturnValue({ from });
      const { GET } = await import('@/app/api/community/route');

      const response = await GET(new NextRequest('http://localhost/api/community?bookmarked=true'));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
      expect(from).not.toHaveBeenCalled();
    });

    it('uses inner embeds so place and bookmark filters exclude non-matching posts', async () => {
      const posts = queryChain({ data: [], error: null });
      const blocks = queryChain({ data: [], error: null });
      createSupabaseAdminClient.mockReturnValue({
        from: vi.fn((table: string) => (table === 'community_posts' ? posts : blocks))
      });
      const { GET } = await import('@/app/api/community/route');

      const response = await GET(new NextRequest('http://localhost/api/community?contentId=126508&bookmarked=true'));

      expect(response.status).toBe(200);
      const select = posts.select.mock.calls[0][0] as string;
      expect(select).toContain('places!inner(content_id, name, address, category)');
      expect(select).toContain('community_bookmarks!inner(actor_key)');
      expect(posts.eq).toHaveBeenCalledWith('places.content_id', '126508');
      expect(posts.eq).toHaveBeenCalledWith('community_bookmarks.actor_key', actor.actorKey);
    });

    it('keeps left embeds for the unfiltered public feed', async () => {
      getCurrentUser.mockResolvedValue(null);
      const posts = queryChain({ data: [], error: null });
      createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => posts) });
      const { GET } = await import('@/app/api/community/route');

      await GET(new NextRequest('http://localhost/api/community'));

      const select = posts.select.mock.calls[0][0] as string;
      expect(select).toContain('places(content_id, name, address, category)');
      expect(select).not.toContain('!inner');
    });

    it('combines tip, area, and linked place category filters before limiting results', async () => {
      getCurrentUser.mockResolvedValue(null);
      const posts = queryChain({ data: [], error: null });
      createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => posts) });
      const { GET } = await import('@/app/api/community/route');
      const response = await GET(new NextRequest('http://localhost/api/community?category=tip&region=황남동&placeCategory=food'));
      expect(response.status).toBe(200);
      expect(posts.select).toHaveBeenCalledWith(expect.stringContaining('places!inner('));
      expect(posts.eq).toHaveBeenCalledWith('category', 'tip');
      expect(posts.eq).toHaveBeenCalledWith('places.category', 'food');
      expect(posts.ilike).toHaveBeenCalledWith('places.address', '%황남동%');
    });

    it('answers 503 with a stable message when the database cannot be reached', async () => {
      getCurrentUser.mockResolvedValue(null);
      const posts = queryChain({ data: null, error: { message: 'TypeError: fetch failed' } });
      createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => posts) });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { GET } = await import('@/app/api/community/route');

      const response = await GET(new NextRequest('http://localhost/api/community'));

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: {
          code: 'COMMUNITY_UNAVAILABLE',
          message: '커뮤니티 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'
        }
      });
      expect(errorSpy).toHaveBeenCalledWith('[community] feed read failed', 'TypeError: fetch failed');
      errorSpy.mockRestore();
    });
  });

  describe('POST', () => {
    it.each(['food', 'lodging'])('requires linked place and rating for %s reviews', async category => {
      const rpc = vi.fn();
      createSupabaseAdminClient.mockReturnValue({ from: vi.fn(), rpc });
      const { POST } = await import('@/app/api/community/route');
      for (const payload of [{ rating: 4 }, { contentId: '123' }]) {
        const response = await POST(postRequest({ category, title: '방문 후기', content: '좋았어요.', ...payload }));
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ error: { code: 'REVIEW_PLACE_REQUIRED' } });
      }
      expect(rpc).not.toHaveBeenCalled();
    });

    it('rejects a food rating linked to an accommodation', async () => {
      const place = queryChain({ data: { id: 'place-1', category: 'lodging' }, error: null });
      const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
      createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => place), rpc });
      moderateContent.mockResolvedValue({ allowed: true, categories: {} });
      const { POST } = await import('@/app/api/community/route');
      const response = await POST(postRequest({ category: 'food', title: '평가', content: '후기', contentId: '123', rating: 4 }));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVALID_REVIEW_PLACE' } });
      expect(rpc).not.toHaveBeenCalledWith('create_community_post', expect.anything());
    });

    it('rejects a post before any database write when server moderation rejects it', async () => {
      const from = vi.fn();
      const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
      createSupabaseAdminClient.mockReturnValue({ from, rpc });
      moderateContent.mockResolvedValue({
        allowed: false,
        flagged: true,
        categories: { harassment: true }
      });
      const { POST } = await import('@/app/api/community/route');

      const response = await POST(postRequest({
        category: 'review',
        title: '검사 대상 제목',
        content: '검사 대상 내용'
      }));

      expect(moderateContent).toHaveBeenCalledWith({ text: '검사 대상 제목\n검사 대상 내용' });
      expect(rpc).toHaveBeenCalledWith('consume_api_rate_limit', expect.objectContaining({
        p_actor_key: actor.actorKey,
        p_scope: 'community-post',
        p_limit: 5
      }));
      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'MODERATION_REJECTED' } });
      expect(from).not.toHaveBeenCalled();
    });

    it('validates the body before consuming the rate limit', async () => {
      const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
      createSupabaseAdminClient.mockReturnValue({ from: vi.fn(), rpc });
      const { POST } = await import('@/app/api/community/route');

      const malformed = await POST(postRequest({ category: 'review', title: ['not', 'a', 'string'], content: '내용' }));
      const badMedia = await POST(postRequest({ category: 'review', title: '제목', content: '내용', mediaIds: 'media-1' }));

      expect(malformed.status).toBe(400);
      await expect(malformed.json()).resolves.toMatchObject({ error: { code: 'INVALID_POST' } });
      expect(badMedia.status).toBe(400);
      await expect(badMedia.json()).resolves.toMatchObject({ error: { code: 'INVALID_POST' } });
      expect(rpc).not.toHaveBeenCalled();
    });

    it('fails closed with 503 when the rate limiter itself is unavailable', async () => {
      const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'offline' } });
      createSupabaseAdminClient.mockReturnValue({ from: vi.fn(), rpc });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { POST } = await import('@/app/api/community/route');

      const response = await POST(postRequest({ category: 'review', title: '제목', content: '내용' }));

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'RATE_LIMIT_UNAVAILABLE' } });
      expect(moderateContent).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('stores no rating for a tip post even when the client sends one', async () => {
      const postId = '5f0c2a54-3d3e-4f7b-9a41-0b1c2d3e4f50';
      const readBack = queryChain({
        data: {
          id: postId,
          actor_key: actor.actorKey,
          author_name: '여행자',
          category: 'tip',
          title: '경주 꿀팁',
          content: '아침에 가세요.',
          rating: null,
          created_at: '2026-09-04T00:00:00.000Z',
          updated_at: '2026-09-04T00:00:00.000Z',
          places: null,
          community_media: [],
          community_bookmarks: []
        },
        error: null
      });
      const rpc = vi.fn(async (name: string) =>
        name === 'consume_api_rate_limit' ? { data: true, error: null } : { data: postId, error: null }
      );
      createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => readBack), rpc });
      moderateContent.mockResolvedValue({ allowed: true, flagged: false, categories: {} });
      const { POST } = await import('@/app/api/community/route');

      const response = await POST(postRequest({ category: 'tip', title: '경주 꿀팁', content: '아침에 가세요.', rating: 5 }));

      expect(response.status).toBe(201);
      expect(rpc).toHaveBeenCalledWith('create_community_post', expect.objectContaining({
        p_category: 'tip',
        p_rating: null
      }));
    });
  });
});

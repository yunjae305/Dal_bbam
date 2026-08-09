import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getCurrentUser = vi.fn();
const createSupabaseAdminClient = vi.fn();
const moderateContent = vi.fn();

vi.mock('@/backend/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient }));
vi.mock('@/backend/openai', () => ({ moderateContent }));

const actor = { id: 'user-1', name: '여행자', provider: 'demo', actorKey: 'demo:user-1' };

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    actor_key: actor.actorKey,
    author_name: '여행자',
    category: 'review',
    title: '경주 여행 후기',
    content: '좋은 여행이었습니다.',
    rating: 5,
    created_at: '2026-08-09T00:00:00.000Z',
    updated_at: '2026-08-09T00:00:00.000Z',
    places: null,
    community_media: [],
    community_bookmarks: [{ actor_key: actor.actorKey }],
    ...overrides
  };
}

function selectChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  return chain;
}

function updateChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.update = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue(result);
  return chain;
}

describe('community post detail route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(actor);
    moderateContent.mockResolvedValue({ allowed: true, flagged: false, categories: {} });
  });

  it('returns one published post with owner and bookmark state', async () => {
    const chain = selectChain({ data: row(), error: null });
    createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => chain) });
    const { GET } = await import('@/app/api/community/[id]/route');

    const response = await GET(
      new NextRequest('http://localhost/api/community/post-1'),
      { params: Promise.resolve({ id: 'post-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        id: 'post-1',
        title: '경주 여행 후기',
        isOwner: true,
        bookmarked: true
      }
    });
    expect(chain.eq).toHaveBeenNthCalledWith(1, 'id', 'post-1');
    expect(chain.eq).toHaveBeenNthCalledWith(2, 'status', 'published');
  });

  it('returns 404 when the published post does not exist', async () => {
    const chain = selectChain({ data: null, error: null });
    createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => chain) });
    const { GET } = await import('@/app/api/community/[id]/route');

    const response = await GET(
      new NextRequest('http://localhost/api/community/missing'),
      { params: Promise.resolve({ id: 'missing' }) }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'POST_NOT_FOUND' } });
  });

  it('rejects an unauthenticated update', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { PATCH } = await import('@/app/api/community/[id]/route');

    const response = await PATCH(
      new NextRequest('http://localhost/api/community/post-1', {
        method: 'PATCH',
        body: JSON.stringify({ title: '수정 제목' })
      }),
      { params: Promise.resolve({ id: 'post-1' }) }
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('persists a category change and clears the rating for a tip post', async () => {
    const owned = selectChain({ data: row(), error: null });
    const updatedRow = row({ category: 'tip', rating: null });
    const updated = updateChain({ data: updatedRow, error: null });
    const from = vi.fn()
      .mockReturnValueOnce(owned)
      .mockReturnValueOnce(updated);
    createSupabaseAdminClient.mockReturnValue({ from });
    const { PATCH } = await import('@/app/api/community/[id]/route');

    const response = await PATCH(
      new NextRequest('http://localhost/api/community/post-1', {
        method: 'PATCH',
        body: JSON.stringify({ category: 'tip', title: '경주 꿀팁', content: '아침에 방문해 보세요.', rating: 5 })
      }),
      { params: Promise.resolve({ id: 'post-1' }) }
    );

    expect(response.status).toBe(200);
    expect(updated.update).toHaveBeenCalledWith(expect.objectContaining({
      category: 'tip',
      rating: null,
      title: '경주 꿀팁',
      content: '아침에 방문해 보세요.'
    }));
    expect(moderateContent).toHaveBeenCalledWith({ text: '경주 꿀팁\n아침에 방문해 보세요.' });
  });

  it('does not update a post when server moderation is unavailable', async () => {
    const owned = selectChain({ data: row(), error: null });
    const from = vi.fn(() => owned);
    createSupabaseAdminClient.mockReturnValue({ from });
    moderateContent.mockRejectedValue(new Error('OPENAI_API_KEY is not configured.'));
    const { PATCH } = await import('@/app/api/community/[id]/route');

    const response = await PATCH(
      new NextRequest('http://localhost/api/community/post-1', {
        method: 'PATCH',
        body: JSON.stringify({ title: '수정 제목', content: '수정 내용' })
      }),
      { params: Promise.resolve({ id: 'post-1' }) }
    );

    expect(moderateContent).toHaveBeenCalledWith({ text: '수정 제목\n수정 내용' });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'MODERATION_UNAVAILABLE' } });
    expect(from).toHaveBeenCalledTimes(1);
    expect(owned).not.toHaveProperty('update');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getCurrentUser = vi.fn();
const createSupabaseAdminClient = vi.fn();
const moderateContent = vi.fn();

vi.mock('@/backend/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient }));
vi.mock('@/backend/openai', () => ({ moderateContent }));

const actor = { id: 'user-1', name: '여행자', provider: 'demo', actorKey: 'demo:user-1' };
const postId = '0f1e2d3c-4b5a-4c6d-8e7f-90a1b2c3d4e5';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: postId,
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

type Result = { data: unknown; error: unknown };

function selectChain(result: Result) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  return chain;
}

/** Awaitable select builder (no terminal call), as used by readPostMediaObjects. */
function listChain(result: Result) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.then = (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain as Record<string, ReturnType<typeof vi.fn>>;
}

function updateChain(result: Result) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.update = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue(result);
  return chain;
}

function deleteChain(result: Result) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  return chain;
}

function patchRequest(body: unknown, id = postId) {
  return new NextRequest(`http://localhost/api/community/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

describe('community post detail route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(actor);
    moderateContent.mockResolvedValue({ allowed: true, flagged: false, categories: {} });
  });

  it('returns one published post with owner and bookmark state', async () => {
    const chain = selectChain({ data: row(), error: null });
    const blocked = selectChain({ data: null, error: null });
    createSupabaseAdminClient.mockReturnValue({
      from: vi.fn()
        .mockReturnValueOnce(chain)
        .mockReturnValueOnce(blocked)
    });
    const { GET } = await import('@/app/api/community/[id]/route');

    const response = await GET(
      new NextRequest(`http://localhost/api/community/${postId}`),
      { params: Promise.resolve({ id: postId }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        id: postId,
        title: '경주 여행 후기',
        isOwner: true,
        bookmarked: true
      }
    });
    expect(chain.eq).toHaveBeenNthCalledWith(1, 'id', postId);
    expect(chain.eq).toHaveBeenNthCalledWith(2, 'status', 'published');
  });

  it('returns 404 when the published post does not exist', async () => {
    const chain = selectChain({ data: null, error: null });
    createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => chain) });
    const { GET } = await import('@/app/api/community/[id]/route');

    const response = await GET(
      new NextRequest('http://localhost/api/community/6d5c4b3a-2f1e-4d0c-9b8a-7f6e5d4c3b2a'),
      { params: Promise.resolve({ id: '6d5c4b3a-2f1e-4d0c-9b8a-7f6e5d4c3b2a' }) }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'POST_NOT_FOUND' } });
  });

  it('answers 404 for a non-UUID id without querying the database', async () => {
    const from = vi.fn();
    createSupabaseAdminClient.mockReturnValue({ from, rpc: vi.fn() });
    const { GET, PATCH, DELETE } = await import('@/app/api/community/[id]/route');
    const params = { params: Promise.resolve({ id: 'missing' }) };

    const read = await GET(new NextRequest('http://localhost/api/community/missing'), params);
    const update = await PATCH(patchRequest({ title: '수정' }, 'missing'), params);
    const remove = await DELETE(new NextRequest('http://localhost/api/community/missing', { method: 'DELETE' }), params);

    for (const response of [read, update, remove]) {
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'POST_NOT_FOUND' } });
    }
    expect(from).not.toHaveBeenCalled();
  });

  it('answers 503 with a stable message when the database cannot be reached', async () => {
    const chain = selectChain({ data: null, error: { message: 'TypeError: fetch failed' } });
    createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => chain) });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { GET } = await import('@/app/api/community/[id]/route');

    const response = await GET(
      new NextRequest(`http://localhost/api/community/${postId}`),
      { params: Promise.resolve({ id: postId }) }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'COMMUNITY_UNAVAILABLE', message: '커뮤니티 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' }
    });
    errorSpy.mockRestore();
  });

  it('rejects an unauthenticated update', async () => {
    getCurrentUser.mockResolvedValue(null);
    const { PATCH } = await import('@/app/api/community/[id]/route');

    const response = await PATCH(patchRequest({ title: '수정 제목' }), { params: Promise.resolve({ id: postId }) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('validates the patch body before consuming the rate limit', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    createSupabaseAdminClient.mockReturnValue({ from: vi.fn(), rpc });
    const { PATCH } = await import('@/app/api/community/[id]/route');

    const response = await PATCH(patchRequest({ title: 42 }), { params: Promise.resolve({ id: postId }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVALID_BODY' } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the rate limiter is unavailable', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'offline' } });
    const from = vi.fn();
    createSupabaseAdminClient.mockReturnValue({ from, rpc });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { PATCH } = await import('@/app/api/community/[id]/route');

    const response = await PATCH(patchRequest({ title: '수정 제목' }), { params: Promise.resolve({ id: postId }) });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'RATE_LIMIT_UNAVAILABLE' } });
    expect(from).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('persists a category change and clears the rating for a tip post', async () => {
    const owned = selectChain({ data: row(), error: null });
    const updatedRow = row({ category: 'tip', rating: null });
    const updated = updateChain({ data: updatedRow, error: null });
    const from = vi.fn()
      .mockReturnValueOnce(owned)
      .mockReturnValueOnce(updated);
    createSupabaseAdminClient.mockReturnValue({
      from,
      rpc: vi.fn().mockResolvedValue({ data: true, error: null })
    });
    const { PATCH } = await import('@/app/api/community/[id]/route');

    const response = await PATCH(
      patchRequest({ category: 'tip', title: '경주 꿀팁', content: '아침에 방문해 보세요.', rating: 5 }),
      { params: Promise.resolve({ id: postId }) }
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
    createSupabaseAdminClient.mockReturnValue({
      from,
      rpc: vi.fn().mockResolvedValue({ data: true, error: null })
    });
    moderateContent.mockRejectedValue(new Error('OPENAI_API_KEY is not configured.'));
    const { PATCH } = await import('@/app/api/community/[id]/route');

    const response = await PATCH(
      patchRequest({ title: '수정 제목', content: '수정 내용' }),
      { params: Promise.resolve({ id: postId }) }
    );

    expect(moderateContent).toHaveBeenCalledWith({ text: '수정 제목\n수정 내용' });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'MODERATION_UNAVAILABLE' } });
    expect(from).toHaveBeenCalledTimes(1);
    expect(owned).not.toHaveProperty('update');
  });

  it('deletes the database row before storage and tolerates a storage cleanup failure', async () => {
    const media = listChain({
      data: [{ id: 'media-1', staging_path: null, public_storage_path: 'images/media-1.jpg' }],
      error: null
    });
    const removal = deleteChain({ data: { id: postId }, error: null });
    const remove = vi.fn().mockResolvedValue({ error: { message: 'storage offline' } });
    createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => (table === 'community_media' ? media : removal)),
      storage: { from: vi.fn(() => ({ remove })) }
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { DELETE } = await import('@/app/api/community/[id]/route');

    const response = await DELETE(
      new NextRequest(`http://localhost/api/community/${postId}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: postId }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { deleted: true } });
    expect(removal.maybeSingle.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
    expect(remove).toHaveBeenCalledWith(['images/media-1.jpg']);
    expect(errorSpy).toHaveBeenCalledWith(
      '[community] post media cleanup failed after delete',
      { postId, error: 'storage offline' }
    );
    errorSpy.mockRestore();
  });

  it('does not touch storage when the post was not deleted', async () => {
    const media = listChain({ data: [], error: null });
    const removal = deleteChain({ data: null, error: null });
    const remove = vi.fn();
    createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => (table === 'community_media' ? media : removal)),
      storage: { from: vi.fn(() => ({ remove })) }
    });
    const { DELETE } = await import('@/app/api/community/[id]/route');

    const response = await DELETE(
      new NextRequest(`http://localhost/api/community/${postId}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: postId }) }
    );

    expect(response.status).toBe(404);
    expect(remove).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getCurrentUser = vi.fn();
const createSupabaseAdminClient = vi.fn();
vi.mock('@/backend/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient }));

const actor = { id: 'user-1', name: '여행자', provider: 'demo', actorKey: 'demo:user-1' };
const itemId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

function deleteChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  return chain;
}

function deleteRequest(id: string) {
  return new NextRequest(`http://localhost/api/cart?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

describe('cart route authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(null);
    createSupabaseAdminClient.mockReturnValue(null);
  });

  it('returns the normalized 401 contract without accepting user_id', async () => {
    const { GET } = await import('@/app/api/cart/route');
    const response = await GET(new NextRequest('http://localhost/api/cart?user_id=another-user'));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'UNAUTHENTICATED',
        message: '로그인이 필요합니다.'
      }
    });
  });
});

describe('cart route DELETE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(actor);
  });

  it('rejects a non-UUID id before querying', async () => {
    const from = vi.fn();
    createSupabaseAdminClient.mockReturnValue({ from });
    const { DELETE } = await import('@/app/api/cart/route');

    const response = await DELETE(deleteRequest('not-a-uuid'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVALID_CART_ITEM' } });
    expect(from).not.toHaveBeenCalled();
  });

  it('returns 404 when nothing owned by the caller was deleted', async () => {
    const chain = deleteChain({ data: null, error: null });
    createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => chain) });
    const { DELETE } = await import('@/app/api/cart/route');

    const response = await DELETE(deleteRequest(itemId));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'CART_ITEM_NOT_FOUND' } });
    expect(chain.eq).toHaveBeenCalledWith('id', itemId);
    expect(chain.eq).toHaveBeenCalledWith('actor_key', actor.actorKey);
    expect(chain.select).toHaveBeenCalledWith('id');
  });

  it('confirms a deletion that removed a row', async () => {
    const chain = deleteChain({ data: { id: itemId }, error: null });
    createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => chain) });
    const { DELETE } = await import('@/app/api/cart/route');

    const response = await DELETE(deleteRequest(itemId));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { deleted: true } });
  });
});

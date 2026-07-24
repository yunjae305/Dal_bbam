import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getCurrentUser = vi.fn();
vi.mock('@/backend/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient: vi.fn(() => null) }));

describe('cart route authentication', () => {
  beforeEach(() => getCurrentUser.mockResolvedValue(null));

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

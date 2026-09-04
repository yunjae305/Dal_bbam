import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createDb: vi.fn()
}));

vi.mock('@/backend/auth/admin', () => ({ authorizeAdminRequest: mocks.authorize }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient: mocks.createDb }));

import { POST } from '@/app/api/admin/shorts/route';

function request(headers: Record<string, string> = {}) {
  return new NextRequest('https://dal-bbam.example/api/admin/shorts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({})
  });
}

describe('/api/admin/shorts security boundary', () => {
  beforeEach(() => {
    mocks.authorize.mockReset();
    mocks.createDb.mockReset();
  });

  it('rejects cross-site browser mutations before authentication', async () => {
    const response = await POST(request({
      origin: 'https://attacker.example',
      'sec-fetch-site': 'cross-site'
    }));
    expect(response.status).toBe(403);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });

  it('fails closed when common admin authorization rejects the request', async () => {
    mocks.authorize.mockResolvedValue({ authorized: false, user: null, method: null });
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('Bearer');
    expect(mocks.createDb).not.toHaveBeenCalled();
  });

  it('fails closed when the database-backed rate limiter is unavailable', async () => {
    mocks.authorize.mockResolvedValue({ authorized: true, user: null, method: 'secret' });
    mocks.createDb.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'offline' } })
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('RATE_LIMIT_UNAVAILABLE');
  });

  it('returns 429 and Retry-After when the atomic quota is exhausted', async () => {
    mocks.authorize.mockResolvedValue({ authorized: true, user: null, method: 'secret' });
    mocks.createDb.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: false, error: null })
    });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSupabaseServerClient = vi.fn();
vi.mock('@/backend/supabase/server', () => ({ createSupabaseServerClient }));

describe('auth callback redirect target', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSupabaseServerClient.mockResolvedValue(null);
  });

  async function redirectFor(next: string | null) {
    const { GET } = await import('@/app/api/auth/callback/route');
    const url = new URL('https://dal-bbam.example/api/auth/callback');
    if (next !== null) url.searchParams.set('next', next);
    const response = await GET(new Request(url));
    expect(response.status).toBe(307);
    return response.headers.get('location');
  }

  it('follows a same-origin path', async () => {
    await expect(redirectFor('/schedule?tab=today')).resolves.toBe('https://dal-bbam.example/schedule?tab=today');
  });

  it('falls back to the site root when next is missing', async () => {
    await expect(redirectFor(null)).resolves.toBe('https://dal-bbam.example/');
  });

  it.each([
    ['absolute URL', 'https://attacker.example/phish'],
    ['protocol-relative URL', '//attacker.example/phish'],
    ['backslash host trick', '/\\attacker.example'],
    ['backslash after a path segment', '/schedule\\@attacker.example'],
    ['scheme without slash', 'javascript:alert(1)']
  ])('rejects an off-origin next (%s)', async (_label, next) => {
    await expect(redirectFor(next)).resolves.toBe('https://dal-bbam.example/');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/backend/auth/session', () => ({ SESSION_COOKIE: 'session', verifySessionToken: () => null }));
vi.mock('@/backend/auth/persisted-session', () => ({ validatePersistedSession: vi.fn() }));
vi.mock('@/backend/auth/demo', () => ({ isDemoModeEnabled: () => false }));
import { proxy } from './proxy';
afterEach(() => vi.unstubAllEnvs());
describe('public PWA entry and login destination', () => {
  it('allows installation without login or a database connection', async () => {
    const response = await proxy(new NextRequest('https://travel.example/install'));
    expect(response.headers.get('Location')).toBeNull();
  });
  it('preserves the checkpoint query when login is required', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    const response = await proxy(new NextRequest('https://travel.example/stamps?checkpoint=abc'));
    const location = new URL(response.headers.get('Location')!);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toBe('/stamps?checkpoint=abc');
  });
});

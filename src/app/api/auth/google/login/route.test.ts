import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ capabilities: vi.fn(), client: vi.fn(), oauth: vi.fn() }));
vi.mock('@/backend/auth/providers', () => ({ getAuthProviderCapabilities: mocks.capabilities }));
vi.mock('@/backend/supabase/server', () => ({ createSupabaseServerClient: mocks.client }));
import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockResolvedValue({ auth: { signInWithOAuth: mocks.oauth } });
});
const request = () => new NextRequest('https://travel.example/api/auth/google/login');

describe('Google authorization capability gate', () => {
  it('stops a disabled or unavailable provider before starting OAuth', async () => {
    mocks.capabilities.mockResolvedValue({ google: false });
    const response = await GET(request());
    expect(response.headers.get('Location')).toBe('https://travel.example/login?error=google_not_configured&next=%2F');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.oauth).not.toHaveBeenCalled();
  });

  it('starts OAuth only after Google is confirmed enabled', async () => {
    mocks.capabilities.mockResolvedValue({ google: true });
    mocks.oauth.mockResolvedValue({ data: { url: 'https://accounts.google.com/o/oauth2/auth' }, error: null });
    const response = await GET(request());
    expect(response.headers.get('Location')).toBe('https://accounts.google.com/o/oauth2/auth');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.oauth).toHaveBeenCalledWith({ provider: 'google', options: {
      redirectTo: 'https://travel.example/api/auth/callback?next=%2F', skipBrowserRedirect: true
    } });
  });

  it('returns a local error when auth client configuration disappears', async () => {
    mocks.capabilities.mockResolvedValue({ google: true });
    mocks.client.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.headers.get('Location')).toContain('error=google_not_configured');
    expect(mocks.oauth).not.toHaveBeenCalled();
  });

  it('preserves a schedule deep link through Google authorization', async () => {
    mocks.capabilities.mockResolvedValue({ google: true });
    mocks.oauth.mockResolvedValue({ data: { url: 'https://accounts.google.com/o/oauth2/auth' }, error: null });
    await GET(new NextRequest('https://travel.example/api/auth/google/login?next=%2Fschedule%3Fid%3Dabc'));
    const callback = new URL(mocks.oauth.mock.calls[0][0].options.redirectTo);
    expect(callback.searchParams.get('next')).toBe('/schedule?id=abc');
  });
});

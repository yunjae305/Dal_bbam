import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.example');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public-test-key');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const settings = (google: boolean) => Response.json({ external: { google, extra: 'not-exposed' }, hidden: 'not-exposed' });

describe('public authentication provider capabilities', () => {
  it('does not call a provider without browser auth configuration', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    const { getAuthProviderCapabilities } = await import('./providers');
    await expect(getAuthProviderCapabilities()).resolves.toEqual({ google: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([true, false])('returns only the verified Google switch (%s)', async google => {
    fetchMock.mockResolvedValue(settings(google));
    const { getAuthProviderCapabilities } = await import('./providers');
    await expect(getAuthProviderCapabilities()).resolves.toEqual({ google });
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://project.example/auth/v1/settings');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store', headers: { apikey: 'public-test-key' } });
  });

  it('coalesces 100 concurrent checks and refreshes a provider toggle after the cache expires', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    const { getAuthProviderCapabilities } = await import('./providers');
    const requests = Array.from({ length: 100 }, () => getAuthProviderCapabilities());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(settings(false));
    expect(await Promise.all(requests)).toEqual(Array.from({ length: 100 }, () => ({ google: false })));
    await getAuthProviderCapabilities();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_001);
    fetchMock.mockResolvedValueOnce(settings(true));
    await expect(getAuthProviderCapabilities()).resolves.toEqual({ google: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('bounds a hung provider check, aborts its fetch, and recovers after a short retry delay', async () => {
    fetchMock.mockImplementationOnce(() => new Promise<Response>(() => {}));
    const { getAuthProviderCapabilities } = await import('./providers');
    const pending = getAuthProviderCapabilities();
    await vi.advanceTimersByTimeAsync(2_500);
    await expect(pending).resolves.toEqual({ google: false });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await getAuthProviderCapabilities();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_001);
    fetchMock.mockResolvedValueOnce(settings(true));
    await expect(getAuthProviderCapabilities()).resolves.toEqual({ google: true });
  });

  it.each([null, {}, { external: { google: 'true' } }])('fails closed for malformed provider settings %j', async payload => {
    fetchMock.mockResolvedValue(Response.json(payload));
    const { getAuthProviderCapabilities } = await import('./providers');
    await expect(getAuthProviderCapabilities()).resolves.toEqual({ google: false });
  });

  it('fails closed on provider errors and never reuses configuration from another project', async () => {
    fetchMock.mockResolvedValueOnce(settings(true));
    const { getAuthProviderCapabilities } = await import('./providers');
    await expect(getAuthProviderCapabilities()).resolves.toEqual({ google: true });
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://different.example');
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(getAuthProviderCapabilities()).resolves.toEqual({ google: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

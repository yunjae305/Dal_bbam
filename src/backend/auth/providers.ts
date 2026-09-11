import { getSupabaseEnv } from '@/backend/supabase/env';

export type AuthProviderCapabilities = { google: boolean };
type Probe = { capabilities: AuthProviderCapabilities; verified: boolean };

const TIMEOUT_MS = 2_500;
const CACHE_MS = 30_000;
const RETRY_MS = 5_000;
let cached: { key: string; expiresAt: number; capabilities: AuthProviderCapabilities } | null = null;
let inFlight: { key: string; promise: Promise<AuthProviderCapabilities> } | null = null;

async function probeSettings(url: string, key: string): Promise<Probe> {
  const unavailable: Probe = { capabilities: { google: false }, verified: false };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async (): Promise<Probe> => {
        const response = await fetch(new URL('/auth/v1/settings', url), {
          headers: { apikey: key, Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal
        });
        if (!response.ok) return unavailable;
        const settings: unknown = await response.json();
        if (!settings || typeof settings !== 'object' || !('external' in settings)) return unavailable;
        const external = settings.external;
        if (!external || typeof external !== 'object' || !('google' in external) || typeof external.google !== 'boolean') return unavailable;
        return { capabilities: { google: external.google }, verified: true };
      })(),
      new Promise<Probe>(resolve => {
        timer = setTimeout(() => { controller.abort(); resolve(unavailable); }, TIMEOUT_MS);
      })
    ]);
  } catch {
    return unavailable;
  } finally {
    clearTimeout(timer);
  }
}

/** Public provider switches only; no users, sessions or provider secrets are returned. */
export async function getAuthProviderCapabilities(): Promise<AuthProviderCapabilities> {
  const { url, publishableKey } = getSupabaseEnv();
  if (!url || !publishableKey) return { google: false };
  const key = `${url}\n${publishableKey}`;
  if (cached?.key === key && cached.expiresAt > Date.now()) return cached.capabilities;
  if (inFlight?.key === key) return inFlight.promise;

  const promise = probeSettings(url, publishableKey).then(({ capabilities, verified }) => {
    cached = { key, capabilities, expiresAt: Date.now() + (verified ? CACHE_MS : RETRY_MS) };
    return capabilities;
  });
  inFlight = { key, promise };
  try {
    return await promise;
  } finally {
    if (inFlight?.promise === promise) inFlight = null;
  }
}

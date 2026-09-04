import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from './env';
import { fetchWithTimeout } from '@/backend/fetch-timeout';

// Storage uploads/downloads (community media, narration audio, stamp artwork)
// need far longer than the 3 s provider-probe default.
const DEFAULT_ADMIN_REQUEST_TIMEOUT_MS = 15_000;

function adminRequestTimeoutMs(): number {
  const parsed = Number(process.env.SUPABASE_ADMIN_REQUEST_TIMEOUT_MS);
  return Number.isFinite(parsed)
    ? Math.min(60_000, Math.max(1_000, parsed))
    : DEFAULT_ADMIN_REQUEST_TIMEOUT_MS;
}

export function createSupabaseAdminClient() {
  const { url, secretKey } = getSupabaseEnv();

  if (!url || !secretKey) {
    return null;
  }

  const timeoutMs = adminRequestTimeoutMs();

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    },
    global: {
      fetch: (input, init) => fetchWithTimeout(input, init, timeoutMs)
    }
  });
}

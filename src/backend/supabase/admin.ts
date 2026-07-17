import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from './env';

export function createSupabaseAdminClient() {
  const { url, secretKey } = getSupabaseEnv();

  if (!url || !secretKey) {
    return null;
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });
}

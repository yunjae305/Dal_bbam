import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseEnv } from './env';
import { fetchWithTimeout } from '@/backend/fetch-timeout';

export async function createSupabaseServerClient() {
  const env = getSupabaseEnv();

  if (!env.url || !env.publishableKey) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(env.url, env.publishableKey, {
    global: {
      fetch: fetchWithTimeout
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {}
      }
    }
  });
}

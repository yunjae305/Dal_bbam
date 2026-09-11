import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseEnv } from '@/backend/supabase/env';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const env = getSupabaseEnv();
  if (!env.url || !env.publishableKey) {
    return NextResponse.redirect(new URL('/login?error=google_not_configured', request.url));
  }

  const cookieStore = await cookies();
  const cookiesToSet: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(toSet) { cookiesToSet.push(...toSet); }
    }
  });

  const host = request.headers.get('host') ?? 'localhost:3000';
  const protocol = host.startsWith('localhost') ? 'http' : 'https';
  const callback = new URL('/api/auth/callback', `${protocol}://${host}`);
  callback.searchParams.set('next', '/');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callback.toString(), skipBrowserRedirect: true }
  });

  if (error || !data.url) {
    console.error('[google-login] authorization URL failed', error?.message);
    return NextResponse.redirect(new URL('/login?error=google_authorization_failed', request.url));
  }

  const response = NextResponse.redirect(data.url);
  response.headers.set('Cache-Control', 'no-store');
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  });
  return response;
}

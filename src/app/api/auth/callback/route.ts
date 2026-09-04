import { createSupabaseServerClient } from '@/backend/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = resolveSameOriginNext(searchParams.get('next'), origin);

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error('[auth-callback] code exchange failed', error.message);
        return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
      }
    }
  }

  return NextResponse.redirect(next);
}

/**
 * Only same-origin paths may be used as a post-login destination. Anything
 * that resolves elsewhere (absolute URLs, protocol-relative `//host`,
 * backslash tricks such as `/\evil.com`) falls back to the site root.
 */
function resolveSameOriginNext(requested: string | null, origin: string): URL {
  const fallback = new URL('/', origin);
  if (!requested || !requested.startsWith('/') || requested.includes('\\')) return fallback;
  try {
    const target = new URL(requested, origin);
    if (target.origin !== origin) return fallback;
    return target;
  } catch {
    return fallback;
  }
}

import { createSupabaseServerClient } from '@/backend/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(new URL('/login?error=google_not_configured', request.url));
  }

  const callback = new URL('/api/auth/callback', request.nextUrl.origin);
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
  return response;
}


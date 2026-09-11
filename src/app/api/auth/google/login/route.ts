import { createSupabaseServerClient } from '@/backend/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthProviderCapabilities } from '@/backend/auth/providers';

function unavailable(request: NextRequest, error: string) {
  const response = NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/** Proxied deployments keep the public host in a forwarded header, not in the request URL. */
function publicOrigin(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) return request.nextUrl.origin;
  const protocol = request.headers.get('x-forwarded-proto')
    ?? (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

export async function GET(request: NextRequest) {
  if (!(await getAuthProviderCapabilities()).google) {
    return unavailable(request, 'google_not_configured');
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return unavailable(request, 'google_not_configured');
  }

  const callback = new URL('/api/auth/callback', publicOrigin(request));
  callback.searchParams.set('next', '/');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callback.toString(), skipBrowserRedirect: true }
  });

  if (error || !data.url) {
    console.error('[google-login] authorization URL failed', error?.message);
    return unavailable(request, 'google_authorization_failed');
  }

  const response = NextResponse.redirect(data.url);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

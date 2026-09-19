import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { verifySessionToken, SESSION_COOKIE } from '@/backend/auth/session';
import { validatePersistedSession } from '@/backend/auth/persisted-session';
import { isDemoModeEnabled } from '@/backend/auth/demo';
import { safeNextPath } from '@/shared/auth-navigation';

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const isLoginPage = request.nextUrl.pathname === '/login';
  const isPublicShare = /^\/(?:courses|schedule)\/share\/[a-f0-9]{32}$/i.test(request.nextUrl.pathname);
  const isPublicLegal = request.nextUrl.pathname.startsWith('/legal/') || ['/offline', '/install'].includes(request.nextUrl.pathname);
  if (isPublicShare || isPublicLegal) return NextResponse.next();
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  const afterLogin = new URL(safeNextPath(request.nextUrl.searchParams.get('next')), request.url);
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? verifySessionToken(token) : null;
  const customSessionValid = session?.provider === 'demo'
    ? isDemoModeEnabled()
    : session?.provider === 'kakao'
      ? await validatePersistedSession(session)
      : false;

  if (customSessionValid && isLoginPage) {
    return NextResponse.redirect(afterLogin);
  }
  if (customSessionValid) {
    return NextResponse.next();
  }

  // Supabase가 설정된 환경에서는 Supabase 세션을 사용합니다.
  if (supabaseUrl && supabaseKey) {
    const response = NextResponse.next({ request });

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        }
      }
    });

    const { data: { user } } = await supabase.auth.getUser();

    if (!user && !isLoginPage) {
      return NextResponse.redirect(loginUrl);
    }
    if (user && isLoginPage) {
      return NextResponse.redirect(afterLogin);
    }
    return response;
  }

  // Supabase 미설정 환경에서는 자체 세션 쿠키 인증을 사용합니다.
  if (!isLoginPage) {
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)']
};

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { verifySessionToken, SESSION_COOKIE } from '@/backend/auth/session';

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const isLoginPage = request.nextUrl.pathname === '/login';

  // Supabase 연동 시
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
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (user && isLoginPage) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return response;
  }

  // 자체 세션 쿠키 인증
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? verifySessionToken(token) : null;

  if (!session && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (session && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js).*)']
};

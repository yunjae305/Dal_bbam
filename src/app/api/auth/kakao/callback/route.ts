import { exchangeKakaoCode, getKakaoUser, KAKAO_STATE_COOKIE } from '@/backend/auth/kakao';
import { createSessionToken, createStableUserId, SESSION_COOKIE } from '@/backend/auth/session';
import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const savedState = request.cookies.get(KAKAO_STATE_COOKIE)?.value;

  const statesMatch = Boolean(state && savedState) && (() => {
    const actual = Buffer.from(state!);
    const expected = Buffer.from(savedState!);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  })();

  if (!code || !statesMatch) {
    const response = NextResponse.redirect(`${origin}/login?error=kakao_state`);
    response.cookies.delete(KAKAO_STATE_COOKIE);
    return response;
  }

  try {
    const accessToken = await exchangeKakaoCode({ origin, code });
    const user = await getKakaoUser(accessToken);
    const response = NextResponse.redirect(`${origin}/`);

    response.cookies.set(SESSION_COOKIE, createSessionToken({
      sub: createStableUserId('kakao', user.id),
      email: user.email,
      name: user.name,
      provider: 'kakao'
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/'
    });
    response.cookies.set(KAKAO_STATE_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/'
    });

    return response;
  } catch {
    const response = NextResponse.redirect(`${origin}/login?error=kakao_login`);
    response.cookies.delete(KAKAO_STATE_COOKIE);
    return response;
  }
}

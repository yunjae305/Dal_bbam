import { exchangeKakaoCode, getKakaoUser, KAKAO_STATE_COOKIE } from '@/backend/auth/kakao';
import { createSessionToken, SESSION_COOKIE } from '@/backend/auth/session';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const savedState = request.cookies.get(KAKAO_STATE_COOKIE)?.value;

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(`${origin}/login?error=kakao_state`);
  }

  try {
    const accessToken = await exchangeKakaoCode({ origin, code });
    const user = await getKakaoUser(accessToken);
    const response = NextResponse.redirect(`${origin}/`);

    response.cookies.set(SESSION_COOKIE, createSessionToken(user.email), {
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
    return NextResponse.redirect(`${origin}/login?error=kakao_login`);
  }
}

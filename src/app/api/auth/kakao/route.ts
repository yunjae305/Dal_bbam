import { randomBytes } from 'crypto';
import { buildKakaoAuthorizeUrl, KAKAO_STATE_COOKIE } from '@/backend/auth/kakao';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { origin } = new URL(request.url);

  try {
    const state = randomBytes(24).toString('base64url');
    const url = buildKakaoAuthorizeUrl({ origin, state });
    const response = NextResponse.redirect(url);

    response.cookies.set(KAKAO_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10,
      path: '/'
    });

    return response;
  } catch (error) {
    return NextResponse.redirect(`${origin}/login?error=kakao_not_configured`);
  }
}

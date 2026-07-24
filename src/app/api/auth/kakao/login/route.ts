import { randomBytes } from 'crypto';
import {
  buildKakaoAuthorizeUrl,
  getFrontendUrl,
  KAKAO_STATE_COOKIE,
  KAKAO_STATE_TTL_SECONDS
} from '@/backend/auth/kakao';
import { getAuthCookieOptions } from '@/backend/auth/session';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const state = randomBytes(32).toString('base64url');
    const response = NextResponse.redirect(buildKakaoAuthorizeUrl(state));

    response.cookies.set(KAKAO_STATE_COOKIE, state, {
      ...getAuthCookieOptions(),
      maxAge: KAKAO_STATE_TTL_SECONDS
    });
    response.headers.set('Cache-Control', 'no-store');

    return response;
  } catch (error) {
    console.error('[kakao-login] configuration error', getErrorMessage(error));
    const loginUrl = new URL('/login', getFrontendUrl(request.nextUrl.origin));
    loginUrl.searchParams.set('error', 'kakao_not_configured');

    return NextResponse.redirect(loginUrl);
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

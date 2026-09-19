import { randomBytes } from 'crypto';
import {
  buildKakaoAuthorizeUrl,
  getFrontendUrl,
  KAKAO_STATE_COOKIE,
  KAKAO_STATE_TTL_SECONDS
} from '@/backend/auth/kakao';
import { getAuthCookieOptions } from '@/backend/auth/session';
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_NEXT_COOKIE, safeNextPath } from '@/shared/auth-navigation';

export async function GET(request: NextRequest) {
  try {
    const state = randomBytes(32).toString('base64url');
    const response = NextResponse.redirect(buildKakaoAuthorizeUrl(state));

    response.cookies.set(KAKAO_STATE_COOKIE, state, {
      ...getAuthCookieOptions(),
      maxAge: KAKAO_STATE_TTL_SECONDS
    });
    response.cookies.set(AUTH_NEXT_COOKIE, safeNextPath(request.nextUrl.searchParams.get('next')), {
      ...getAuthCookieOptions(), maxAge: KAKAO_STATE_TTL_SECONDS
    });
    response.headers.set('Cache-Control', 'no-store');

    return response;
  } catch (error) {
    console.error('[kakao-login] configuration error', getErrorMessage(error));
    const loginUrl = new URL('/login', resolveLoginBase(request));
    loginUrl.searchParams.set('error', 'kakao_not_configured');

    return NextResponse.redirect(loginUrl);
  }
}

/** getFrontendUrl throws on a malformed FRONTEND_URL; never let that mask the original error. */
function resolveLoginBase(request: NextRequest): URL {
  try {
    return getFrontendUrl(request.nextUrl.origin);
  } catch (error) {
    console.error('[kakao-login] FRONTEND_URL invalid, falling back to request origin', getErrorMessage(error));
    return new URL('/login', request.nextUrl.origin);
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

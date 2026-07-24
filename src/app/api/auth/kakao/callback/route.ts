import { timingSafeEqual } from 'crypto';
import {
  exchangeKakaoCode,
  getFrontendUrl,
  getKakaoUser,
  KAKAO_STATE_COOKIE
} from '@/backend/auth/kakao';
import {
  createSessionToken,
  getAuthCookieOptions,
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE
} from '@/backend/auth/session';
import { findOrCreateSocialUser } from '@/backend/auth/social-users';
import { NextRequest, NextResponse } from 'next/server';

type LoginError =
  | 'kakao_cancelled'
  | 'kakao_authorization_failed'
  | 'kakao_code_missing'
  | 'kakao_state_mismatch'
  | 'kakao_token_failed'
  | 'kakao_user_failed'
  | 'kakao_user_persistence_failed';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const state = searchParams.get('state');
  const savedState = request.cookies.get(KAKAO_STATE_COOKIE)?.value;

  if (!statesMatch(state, savedState)) {
    return errorResponse(request, 'kakao_state_mismatch');
  }

  const authorizationError = searchParams.get('error');
  if (authorizationError === 'access_denied') {
    return errorResponse(request, 'kakao_cancelled');
  }
  if (authorizationError) {
    return errorResponse(request, 'kakao_authorization_failed');
  }

  const code = searchParams.get('code');
  if (!code) {
    return errorResponse(request, 'kakao_code_missing');
  }

  let accessToken: string;
  try {
    accessToken = await exchangeKakaoCode(code);
  } catch (error) {
    console.error('[kakao-callback] token exchange failed', getErrorMessage(error));
    return errorResponse(request, 'kakao_token_failed');
  }

  let profile: Awaited<ReturnType<typeof getKakaoUser>>;
  try {
    profile = await getKakaoUser(accessToken);
  } catch (error) {
    console.error('[kakao-callback] user lookup failed', getErrorMessage(error));
    return errorResponse(request, 'kakao_user_failed');
  }

  try {
    const user = await findOrCreateSocialUser({
      provider: 'kakao',
      ...profile
    });
    const response = NextResponse.redirect(getFrontendUrl(request.nextUrl.origin));

    response.cookies.set(SESSION_COOKIE, createSessionToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      provider: 'kakao'
    }), {
      ...getAuthCookieOptions(),
      maxAge: SESSION_COOKIE_MAX_AGE
    });
    clearStateCookie(response);
    response.headers.set('Cache-Control', 'no-store');

    return response;
  } catch (error) {
    console.error('[kakao-callback] social user persistence failed', getErrorMessage(error));
    return errorResponse(request, 'kakao_user_persistence_failed');
  }
}

function statesMatch(actual: string | null, expected: string | undefined): boolean {
  if (!actual || !expected) return false;

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

function errorResponse(request: NextRequest, error: LoginError): NextResponse {
  const loginUrl = new URL('/login', getFrontendUrl(request.nextUrl.origin));
  loginUrl.searchParams.set('error', error);
  const response = NextResponse.redirect(loginUrl);

  clearStateCookie(response);
  response.headers.set('Cache-Control', 'no-store');

  return response;
}

function clearStateCookie(response: NextResponse): void {
  response.cookies.set(KAKAO_STATE_COOKIE, '', {
    ...getAuthCookieOptions(),
    maxAge: 0
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

import { NextRequest, NextResponse } from 'next/server';
import {
  createSessionToken,
  createStableUserId,
  getAuthCookieOptions,
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE
} from '@/backend/auth/session';
import { isMutationAllowed } from '@/backend/http';
import { isDemoModeEnabled } from '@/backend/auth/demo';

const DEMO_EMAIL = process.env.DEMO_EMAIL?.trim().toLowerCase() ?? '';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? '';

export function GET() {
  return NextResponse.json({ enabled: isDemoModeEnabled() }, {
    headers: { 'Cache-Control': 'private, no-store' }
  });
}

/**
 * One-tap sign-in with the server-configured contest demo account.
 * Credentials never leave the server; the endpoint only works when both
 * DEMO_EMAIL and DEMO_PASSWORD are configured.
 */
export async function POST(request: NextRequest) {
  if (!isMutationAllowed(request)) {
    return NextResponse.json({ error: '허용되지 않은 요청 출처입니다.' }, { status: 403 });
  }

  if (!isDemoModeEnabled() || !DEMO_EMAIL || !DEMO_PASSWORD) {
    return NextResponse.json({ error: '데모 계정이 설정되지 않았습니다.' }, { status: 503 });
  }

  const token = createSessionToken({
    sub: createStableUserId('demo', DEMO_EMAIL),
    email: DEMO_EMAIL,
    provider: 'demo'
  });
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, token, {
    ...getAuthCookieOptions(),
    maxAge: SESSION_COOKIE_MAX_AGE
  });
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}

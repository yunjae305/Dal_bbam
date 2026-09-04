import { createSupabaseServerClient } from '@/backend/supabase/server';
import { getAuthCookieOptions, SESSION_COOKIE } from '@/backend/auth/session';
import { verifySessionToken } from '@/backend/auth/session';
import { revokePersistedSession } from '@/backend/auth/persisted-session';
import { isMutationAllowed } from '@/backend/http';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  if (!isMutationAllowed(request)) {
    return NextResponse.json({ error: '허용되지 않은 요청 출처입니다.' }, { status: 403 });
  }

  const cookieStore = await cookies();
  const customToken = cookieStore.get(SESSION_COOKIE)?.value;
  await revokePersistedSession(customToken ? verifySessionToken(customToken) : null);

  const supabase = await createSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, '', {
    ...getAuthCookieOptions(),
    maxAge: 0,
  });
  return res;
}

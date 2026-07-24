import { createSupabaseServerClient } from '@/backend/supabase/server';
import {
  createSessionToken,
  createStableUserId,
  getAuthCookieOptions,
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE
} from '@/backend/auth/session';
import { NextResponse } from 'next/server';

const DEMO_EMAIL = process.env.DEMO_EMAIL?.trim().toLowerCase() ?? '';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? '';

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown };

  try {
    body = await request.json() as { email?: unknown; password?: unknown };
  } catch {
    return NextResponse.json({ error: '올바른 JSON 요청이 필요합니다.' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const isDemoLogin = Boolean(DEMO_EMAIL && DEMO_PASSWORD && email === DEMO_EMAIL && password === DEMO_PASSWORD);

  if (!email || !password) {
    return NextResponse.json({ error: '이메일과 비밀번호를 입력해 주세요.' }, { status: 400 });
  }

  if (isDemoLogin) {
    return createLoginResponse(DEMO_EMAIL);
  }

  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return NextResponse.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }
    if (!data.user.email_confirmed_at) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: '이메일 인증 후 로그인해 주세요.' }, { status: 403 });
    }
    return createLoginResponse(data.user.email ?? email);
  }

  return NextResponse.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
}

function createLoginResponse(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const token = createSessionToken({
    sub: createStableUserId('password', normalizedEmail),
    email: normalizedEmail,
    provider: 'password'
  });
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, token, {
    ...getAuthCookieOptions(),
    maxAge: SESSION_COOKIE_MAX_AGE
  });
  return res;
}

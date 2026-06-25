import { createSupabaseServerClient } from '@/backend/supabase/server';
import { createSessionToken, SESSION_COOKIE } from '@/backend/auth/session';
import { NextResponse } from 'next/server';

const DEMO_EMAIL = process.env.LOGIN_EMAIL ?? 'demo@gyeongju.com';
const DEMO_PASSWORD = process.env.LOGIN_PASSWORD ?? 'gyeongju2024';

export async function POST(request: Request) {
  const { email, password } = await request.json() as { email: string; password: string };

  // Supabase가 설정된 환경에서는 Supabase 인증을 사용합니다.
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
    return NextResponse.json({ success: true });
  }

  // Supabase 미설정 환경에서는 데모 계정으로 로그인합니다.
  if (email !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
    return NextResponse.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  const token = createSessionToken(email);
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/'
  });
  return res;
}

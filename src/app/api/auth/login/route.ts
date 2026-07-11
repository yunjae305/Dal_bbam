import { createSupabaseServerClient } from '@/backend/supabase/server';
import { createSessionToken, SESSION_COOKIE } from '@/backend/auth/session';
import { NextResponse } from 'next/server';

const DEMO_EMAIL = process.env.DEMO_EMAIL ?? process.env.NEXT_PUBLIC_DEMO_EMAIL ?? process.env.LOGIN_EMAIL ?? 'demo@gyeongju.com';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? process.env.LOGIN_PASSWORD ?? 'gyeongju2024';

export async function POST(request: Request) {
  let credentials: { email?: string; password?: string };

  try {
    credentials = await request.json() as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: '잘못된 로그인 요청입니다.' }, { status: 400 });
  }

  const email = credentials.email?.trim() ?? '';
  const password = credentials.password ?? '';
  const isDemoLogin = email.toLowerCase() === DEMO_EMAIL.toLowerCase() && password === DEMO_PASSWORD;

  if (!email || !password) {
    return NextResponse.json({ error: '이메일과 비밀번호를 입력해 주세요.' }, { status: 400 });
  }

  // Supabase가 설정된 환경에서는 Supabase 인증을 사용합니다.
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

  // Supabase 미설정 환경에서는 데모 계정으로 로그인합니다.
  if (!isDemoLogin) {
    return NextResponse.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  return createLoginResponse(email);
}

function createLoginResponse(email: string) {
  let token: string;

  try {
    token = createSessionToken(email);
  } catch (error) {
    if (error instanceof Error && error.message.includes('JWT_SECRET')) {
      return NextResponse.json(
        { error: '서버 JWT_SECRET 환경변수가 없어 로그인할 수 없습니다.' },
        { status: 500 }
      );
    }

    throw error;
  }

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

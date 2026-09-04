import { createSupabaseServerClient } from '@/backend/supabase/server';
import { getAuthCookieOptions, SESSION_COOKIE } from '@/backend/auth/session';
import { resolveSupabaseActorKey } from '@/backend/auth/actor-identity';
import { isMutationAllowed } from '@/backend/http';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  if (!isMutationAllowed(request)) {
    return NextResponse.json({ error: '허용되지 않은 요청 출처입니다.' }, { status: 403 });
  }

  let body: { email?: unknown; password?: unknown };

  try {
    body = await request.json() as { email?: unknown; password?: unknown };
  } catch {
    return NextResponse.json({ error: '올바른 JSON 요청이 필요합니다.' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) {
    return NextResponse.json({ error: '이메일과 비밀번호를 입력해 주세요.' }, { status: 400 });
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
    await resolveSupabaseActorKey({
      userId: data.user.id,
      email: data.user.email ?? email,
      authProvider: typeof data.user.app_metadata?.provider === 'string'
        ? data.user.app_metadata.provider
        : 'email'
    });

    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, '', {
      ...getAuthCookieOptions(),
      maxAge: 0
    });
    return response;
  }

  return NextResponse.json({ error: '인증 서버에 연결할 수 없습니다.' }, { status: 503 });
}

import { createSupabaseServerClient } from '@/backend/supabase/server';
import { isMutationAllowed } from '@/backend/http';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  if (!isMutationAllowed(request)) {
    return NextResponse.json({ error: '허용되지 않은 요청 출처입니다.' }, { status: 403 });
  }

  let body: { email?: unknown };
  try {
    body = await request.json() as { email?: unknown };
  } catch {
    return NextResponse.json({ error: '올바른 JSON 요청이 필요합니다.' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: '올바른 이메일을 입력해 주세요.' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: '인증 서버에 연결할 수 없습니다.' }, { status: 503 });
  }

  const callback = new URL('/api/auth/callback', request.nextUrl.origin);
  callback.searchParams.set('next', '/auth/update-password');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callback.toString()
  });
  if (error) console.error('[password-reset] request failed', error.message);

  // Do not reveal whether an account exists for this email.
  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
}


import { createSupabaseServerClient } from '@/backend/supabase/server';
import { isMutationAllowed } from '@/backend/http';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  if (!isMutationAllowed(request)) {
    return NextResponse.json({ error: '허용되지 않은 요청 출처입니다.' }, { status: 403 });
  }

  let body: { email?: unknown; name?: unknown; password?: unknown };

  try {
    body = await request.json() as { email?: unknown; name?: unknown; password?: unknown };
  } catch {
    return NextResponse.json({ error: '올바른 JSON 요청이 필요합니다.' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const { origin } = new URL(request.url);
  const trimmedName = name.trim();

  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 6) {
    return NextResponse.json({ error: '올바른 이메일과 6자 이상의 비밀번호가 필요합니다.' }, { status: 400 });
  }

  if (trimmedName.length < 2) {
    return NextResponse.json({ error: '이름은 2자 이상 입력해 주세요.' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase가 설정되지 않았습니다.' }, { status: 503 });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/api/auth/callback`,
      data: {
        name: trimmedName,
        full_name: trimmedName
      }
    }
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (data.session) {
    await supabase.auth.signOut();
  }

  return NextResponse.json({ success: true, needsEmailVerification: true });
}

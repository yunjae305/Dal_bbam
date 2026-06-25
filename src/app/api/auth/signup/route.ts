import { createSupabaseServerClient } from '@/backend/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { email, name, password } = await request.json() as { email: string; name?: string; password: string };
  const { origin } = new URL(request.url);
  const trimmedName = name?.trim() ?? '';

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

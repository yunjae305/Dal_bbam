import { createSupabaseServerClient } from '@/backend/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { email, password } = await request.json() as { email: string; password: string };
  const { origin } = new URL(request.url);

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase가 설정되지 않았습니다.' }, { status: 503 });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/api/auth/callback`
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

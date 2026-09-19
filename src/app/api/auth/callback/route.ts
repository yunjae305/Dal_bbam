import { createSupabaseServerClient } from '@/backend/supabase/server';
import { NextResponse } from 'next/server';
import { safeNextPath } from '@/shared/auth-navigation';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = new URL(safeNextPath(searchParams.get('next')), origin);

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error('[auth-callback] code exchange failed', error.message);
        return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
      }
    }
  }

  return NextResponse.redirect(next);
}


import { createSupabaseServerClient } from '@/backend/supabase/server';
import { getAuthCookieOptions, SESSION_COOKIE } from '@/backend/auth/session';
import { NextResponse } from 'next/server';

export async function POST() {
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

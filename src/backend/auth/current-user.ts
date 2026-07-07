import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/backend/supabase/server';
import { SESSION_COOKIE, verifySessionToken } from '@/backend/auth/session';

export type CurrentUser = {
  email: string;
  supabaseUserId?: string;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? verifySessionToken(token) : null;

  if (session) {
    return {
      email: session.email
    };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user?.email) {
    return null;
  }

  return {
    email: user.email,
    supabaseUserId: user.id
  };
}

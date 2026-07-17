import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/backend/supabase/server';
import { SESSION_COOKIE, verifySessionToken } from '@/backend/auth/session';

export type CurrentUser = {
  id: string;
  email: string;
  name?: string;
  provider: 'password' | 'kakao' | 'supabase';
  actorKey: string;
  supabaseUserId?: string;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? verifySessionToken(token) : null;

  if (session) {
    return {
      id: session.sub,
      email: session.email,
      name: session.name,
      provider: session.provider,
      actorKey: `${session.provider}:${session.sub}`
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
    id: user.id,
    email: user.email,
    name: typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : undefined,
    provider: 'supabase',
    actorKey: `supabase:${user.id}`,
    supabaseUserId: user.id
  };
}

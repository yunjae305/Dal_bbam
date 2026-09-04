import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/backend/supabase/server';
import { SESSION_COOKIE, verifySessionToken } from '@/backend/auth/session';
import { isDemoModeEnabled } from '@/backend/auth/demo';
import { validatePersistedSession } from '@/backend/auth/persisted-session';
import { resolveSupabaseActorKey } from '@/backend/auth/actor-identity';

export type CurrentUser = {
  id: string;
  email: string | null;
  name?: string;
  provider: 'password' | 'kakao' | 'google' | 'demo' | 'supabase';
  actorKey: string;
  supabaseUserId?: string;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? verifySessionToken(token) : null;

  if (session?.provider === 'demo' && isDemoModeEnabled()) {
    return {
      id: session.sub,
      email: session.email,
      name: session.name,
      provider: session.provider,
      actorKey: `${session.provider}:${session.sub}`
    };
  }

  if (session?.provider === 'kakao' && await validatePersistedSession(session)) {
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

  const authProvider = typeof user.app_metadata?.provider === 'string'
    ? user.app_metadata.provider
    : 'email';
  const actorKey = await resolveSupabaseActorKey({
    userId: user.id,
    email: user.email,
    authProvider
  });

  return {
    id: user.id,
    email: user.email,
    name: typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : undefined,
    provider: authProvider === 'google' ? 'google' : 'supabase',
    actorKey,
    supabaseUserId: user.id
  };
}

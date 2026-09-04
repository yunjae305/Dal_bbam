import { randomUUID } from 'node:crypto';
import {
  createSessionToken,
  SESSION_COOKIE_MAX_AGE,
  type SessionUser
} from '@/backend/auth/session';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';

export async function createPersistedSession(
  user: Omit<SessionUser, 'sessionId'>
): Promise<string> {
  if (user.provider !== 'kakao') {
    throw new Error('Only Kakao custom sessions may be persisted.');
  }

  const db = createSupabaseAdminClient();
  if (!db) throw new Error('Database is required to create a social session.');

  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_COOKIE_MAX_AGE * 1000).toISOString();
  const actorKey = `${user.provider}:${user.sub}`;
  const { error } = await db.from('app_sessions').insert({
    id: sessionId,
    actor_key: actorKey,
    provider: user.provider,
    expires_at: expiresAt
  });

  if (error) throw new Error(`Social session persistence failed: ${error.message}`);
  return createSessionToken({ ...user, sessionId });
}

export async function validatePersistedSession(user: SessionUser): Promise<boolean> {
  if (user.provider !== 'kakao' || !user.sessionId) return false;
  const db = createSupabaseAdminClient();
  if (!db) return false;

  const { data, error } = await db
    .from('app_sessions')
    .select('id')
    .eq('id', user.sessionId)
    .eq('actor_key', `${user.provider}:${user.sub}`)
    .eq('provider', user.provider)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  return !error && Boolean(data?.id);
}

export async function revokePersistedSession(user: SessionUser | null): Promise<void> {
  if (user?.provider !== 'kakao' || !user.sessionId) return;
  const db = createSupabaseAdminClient();
  if (!db) return;

  const { error } = await db
    .from('app_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', user.sessionId)
    .eq('actor_key', `${user.provider}:${user.sub}`);

  if (error) console.error('[session] revoke failed', error.message);
}


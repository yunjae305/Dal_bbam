import { createStableUserId } from '@/backend/auth/session';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';

export async function resolveSupabaseActorKey(input: {
  userId: string;
  email: string;
  authProvider?: string;
}): Promise<string> {
  const db = createSupabaseAdminClient();
  const fallback = `supabase:${input.userId}`;
  if (!db) return fallback;

  const { data: existing, error: readError } = await db
    .from('auth_actor_identities')
    .select('actor_key')
    .eq('auth_user_id', input.userId)
    .maybeSingle();

  if (!readError && existing?.actor_key) return String(existing.actor_key);

  const normalizedProvider = input.authProvider?.trim().toLowerCase() || 'email';
  const actorKey = ['email', 'password'].includes(normalizedProvider)
    ? `password:${createStableUserId('password', input.email.trim().toLowerCase())}`
    : fallback;

  const { data, error } = await db
    .from('auth_actor_identities')
    .upsert({
      auth_user_id: input.userId,
      actor_key: actorKey,
      provider: normalizedProvider,
      updated_at: new Date().toISOString()
    }, { onConflict: 'auth_user_id', ignoreDuplicates: true })
    .select('actor_key')
    .maybeSingle();

  if (error) {
    console.error('[actor-identity] failed to persist canonical actor key', error.message);
    return fallback;
  }

  return String(data?.actor_key || actorKey);
}


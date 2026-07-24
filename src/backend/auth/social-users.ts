import { createStableUserId, type SessionProvider } from '@/backend/auth/session';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';

type SocialProfile = {
  provider: Extract<SessionProvider, 'kakao'>;
  providerUserId: string;
  email: string | null;
  name: string;
};

export type SocialUser = SocialProfile & {
  id: string;
};

export class SocialUserStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SocialUserStoreError';
  }
}

export async function findOrCreateSocialUser(profile: SocialProfile): Promise<SocialUser> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    throw new SocialUserStoreError(
      'Supabase admin credentials are required to persist social users.'
    );
  }

  // Intentionally never query by email: equal emails do not link password and social accounts.
  const existing = await findSocialUser(profile.provider, profile.providerUserId);
  const now = new Date().toISOString();

  if (existing) {
    const { data, error } = await supabase
      .from('social_users')
      .update({
        email: profile.email,
        display_name: profile.name,
        last_login_at: now,
        updated_at: now
      })
      .eq('id', existing.id)
      .select('id, provider, provider_user_id, email, display_name')
      .single();

    if (error || !data) {
      throw new SocialUserStoreError(error?.message || 'Social user update failed.');
    }

    return mapSocialUser(data);
  }

  const { data, error } = await supabase
    .from('social_users')
    .insert({
      id: createStableUserId(profile.provider, profile.providerUserId),
      provider: profile.provider,
      provider_user_id: profile.providerUserId,
      email: profile.email,
      display_name: profile.name,
      last_login_at: now
    })
    .select('id, provider, provider_user_id, email, display_name')
    .single();

  if (error?.code === '23505') {
    const racedUser = await findSocialUser(profile.provider, profile.providerUserId);
    if (racedUser) return racedUser;
  }

  if (error || !data) {
    throw new SocialUserStoreError(error?.message || 'Social user creation failed.');
  }

  return mapSocialUser(data);
}

async function findSocialUser(provider: string, providerUserId: string): Promise<SocialUser | null> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) return null;

  const { data, error } = await supabase
    .from('social_users')
    .select('id, provider, provider_user_id, email, display_name')
    .eq('provider', provider)
    .eq('provider_user_id', providerUserId)
    .maybeSingle();

  if (error) {
    throw new SocialUserStoreError(error.message);
  }

  return data ? mapSocialUser(data) : null;
}

function mapSocialUser(row: {
  id: string;
  provider: string;
  provider_user_id: string;
  email: string | null;
  display_name: string | null;
}): SocialUser {
  return {
    id: row.id,
    provider: 'kakao',
    providerUserId: row.provider_user_id,
    email: row.email,
    name: row.display_name || '카카오 사용자'
  };
}

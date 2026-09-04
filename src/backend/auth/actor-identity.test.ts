import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStableUserId } from '@/backend/auth/session';

const mocks = vi.hoisted(() => ({ createDb: vi.fn() }));

vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient: mocks.createDb }));

import { resolveSupabaseActorKey } from '@/backend/auth/actor-identity';

function database(options: {
  existing?: string | null;
  readError?: { message: string } | null;
  persisted?: string | null;
  writeError?: { message: string } | null;
} = {}) {
  const existingMaybeSingle = vi.fn().mockResolvedValue({
    data: options.existing ? { actor_key: options.existing } : null,
    error: options.readError ?? null
  });
  const existingEq = vi.fn(() => ({ maybeSingle: existingMaybeSingle }));
  const selectExisting = vi.fn(() => ({ eq: existingEq }));

  const persistedMaybeSingle = vi.fn().mockResolvedValue({
    data: options.persisted ? { actor_key: options.persisted } : null,
    error: options.writeError ?? null
  });
  const selectPersisted = vi.fn(() => ({ maybeSingle: persistedMaybeSingle }));
  const upsert = vi.fn(() => ({ select: selectPersisted }));
  const from = vi.fn(() => ({ select: selectExisting, upsert }));

  return {
    client: { from },
    existingEq,
    upsert
  };
}

describe('resolveSupabaseActorKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createDb.mockReturnValue(null);
  });

  it('uses a user-id key when persistence is unavailable', async () => {
    await expect(resolveSupabaseActorKey({
      userId: 'auth-user',
      email: 'person@example.com',
      authProvider: 'google'
    })).resolves.toBe('supabase:auth-user');
  });

  it('keeps the persisted actor key stable when the login email changes', async () => {
    const db = database({ existing: 'password:original-stable-id' });
    mocks.createDb.mockReturnValue(db.client);

    const actorKey = await resolveSupabaseActorKey({
      userId: 'auth-user',
      email: 'new-address@example.com',
      authProvider: 'email'
    });

    expect(actorKey).toBe('password:original-stable-id');
    expect(db.existingEq).toHaveBeenCalledWith('auth_user_id', 'auth-user');
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it('migrates a first email login to the normalized legacy password actor key', async () => {
    const db = database();
    mocks.createDb.mockReturnValue(db.client);

    const actorKey = await resolveSupabaseActorKey({
      userId: 'auth-user',
      email: '  PERSON@Example.com ',
      authProvider: 'EMAIL'
    });

    const expected = `password:${createStableUserId('password', 'person@example.com')}`;
    expect(actorKey).toBe(expected);
    expect(db.upsert).toHaveBeenCalledWith({
      auth_user_id: 'auth-user',
      actor_key: expected,
      provider: 'email',
      updated_at: expect.any(String)
    }, { onConflict: 'auth_user_id', ignoreDuplicates: true });
  });

  it('fails closed to the user-id key when identity persistence errors', async () => {
    const db = database({ writeError: { message: 'write failed' } });
    mocks.createDb.mockReturnValue(db.client);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(resolveSupabaseActorKey({
      userId: 'auth-user',
      email: 'person@example.com',
      authProvider: 'email'
    })).resolves.toBe('supabase:auth-user');

    expect(errorSpy).toHaveBeenCalledWith(
      '[actor-identity] failed to persist canonical actor key',
      'write failed'
    );
    errorSpy.mockRestore();
  });
});

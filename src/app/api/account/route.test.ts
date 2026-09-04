import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createAdminDb: vi.fn(),
  createServerDb: vi.fn()
}));

vi.mock('@/backend/auth/current-user', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient: mocks.createAdminDb }));
vi.mock('@/backend/supabase/server', () => ({ createSupabaseServerClient: mocks.createServerDb }));
vi.mock('@/backend/auth/session', () => ({
  SESSION_COOKIE: 'gy_session',
  getAuthCookieOptions: () => ({ httpOnly: true, secure: false, sameSite: 'lax', path: '/' })
}));

import { DELETE } from '@/app/api/account/route';

type MediaRow = { staging_path: string | null; public_storage_path: string | null };

function request(
  body: Record<string, unknown> = { confirmation: 'DELETE' },
  headers: Record<string, string> = {}
) {
  return new NextRequest('https://dal-bbam.example/api/account', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', host: 'dal-bbam.example', ...headers },
    body: JSON.stringify(body)
  });
}

function database(options: {
  media?: MediaRow[];
  stagingError?: { message: string } | null;
  publicError?: { message: string } | null;
  rpcError?: { message: string } | null;
  identityError?: { message: string } | null;
} = {}) {
  const mediaEq = vi.fn().mockResolvedValue({ data: options.media ?? [], error: null });
  const mediaSelect = vi.fn(() => ({ eq: mediaEq }));
  const socialEq = vi.fn().mockResolvedValue({ error: options.identityError ?? null });
  const socialDelete = vi.fn(() => ({ eq: socialEq }));
  const from = vi.fn((table: string) => {
    if (table === 'community_media') return { select: mediaSelect };
    if (table === 'social_users') return { delete: socialDelete };
    throw new Error(`Unexpected table: ${table}`);
  });

  const stagingRemove = vi.fn().mockResolvedValue({ error: options.stagingError ?? null });
  const publicRemove = vi.fn().mockResolvedValue({ error: options.publicError ?? null });
  const storageFrom = vi.fn((bucket: string) => ({
    remove: bucket === 'community-staging' ? stagingRemove : publicRemove
  }));
  const rpc = vi.fn().mockResolvedValue({ data: null, error: options.rpcError ?? null });
  const deleteUser = vi.fn().mockResolvedValue({ error: options.identityError ?? null });

  return {
    client: {
      from,
      storage: { from: storageFrom },
      rpc,
      auth: { admin: { deleteUser } }
    },
    from,
    mediaEq,
    stagingRemove,
    publicRemove,
    rpc,
    deleteUser,
    socialDelete,
    socialEq
  };
}

describe('/api/account DELETE security and deletion boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.createAdminDb.mockReturnValue(null);
    mocks.createServerDb.mockResolvedValue(null);
  });

  it('rejects a cross-site request before parsing identity or touching storage', async () => {
    const response = await DELETE(request({ confirmation: 'DELETE' }, {
      origin: 'https://attacker.example',
      'sec-fetch-site': 'cross-site'
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('ORIGIN_REJECTED');
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.createAdminDb).not.toHaveBeenCalled();
  });

  it('requires the exact destructive confirmation before authentication', async () => {
    const response = await DELETE(request({ confirmation: 'delete' }));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('CONFIRMATION_REQUIRED');
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated callers and demo accounts', async () => {
    const unauthenticated = await DELETE(request());
    expect(unauthenticated.status).toBe(401);
    expect((await unauthenticated.json()).error.code).toBe('UNAUTHENTICATED');

    mocks.getCurrentUser.mockResolvedValue({
      id: 'demo-user',
      email: 'demo@example.com',
      provider: 'demo',
      actorKey: 'demo:demo-user'
    });
    const demo = await DELETE(request());
    expect(demo.status).toBe(403);
    expect((await demo.json()).error.code).toBe('DEMO_ACCOUNT');
    expect(mocks.createAdminDb).not.toHaveBeenCalled();
  });

  it('removes both storage buckets, actor data, and the Supabase auth identity', async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: 'auth-user',
      email: 'person@example.com',
      provider: 'supabase',
      actorKey: 'password:stable-actor',
      supabaseUserId: 'auth-user'
    });
    const db = database({
      media: [
        { staging_path: 'staged/a.jpg', public_storage_path: 'public/a.webp' },
        { staging_path: null, public_storage_path: 'public/b.webp' }
      ]
    });
    mocks.createAdminDb.mockReturnValue(db.client);
    const signOut = vi.fn().mockResolvedValue({ error: null });
    mocks.createServerDb.mockResolvedValue({ auth: { signOut } });

    const response = await DELETE(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(db.stagingRemove).toHaveBeenCalledWith(['staged/a.jpg']);
    expect(db.publicRemove).toHaveBeenCalledWith(['public/a.webp', 'public/b.webp']);
    expect(db.rpc).toHaveBeenCalledWith('delete_actor_data', {
      p_actor_key: 'password:stable-actor'
    });
    expect(db.deleteUser).toHaveBeenCalledWith('auth-user');
    expect(signOut).toHaveBeenCalledOnce();
    expect(response.headers.get('set-cookie')).toContain('gy_session=');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('removes the Kakao social identity after actor-owned data', async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: 'kakao-user',
      email: null,
      provider: 'kakao',
      actorKey: 'kakao:kakao-user'
    });
    const db = database();
    mocks.createAdminDb.mockReturnValue(db.client);

    const response = await DELETE(request());

    expect(response.status).toBe(200);
    expect(db.socialDelete).toHaveBeenCalledOnce();
    expect(db.socialEq).toHaveBeenCalledWith('id', 'kakao-user');
    expect(db.deleteUser).not.toHaveBeenCalled();
  });

  it('deletes database rows before touching storage', async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: 'auth-user',
      email: 'person@example.com',
      provider: 'supabase',
      actorKey: 'password:stable-actor',
      supabaseUserId: 'auth-user'
    });
    const db = database({
      media: [{ staging_path: 'staged/a.jpg', public_storage_path: 'public/a.webp' }]
    });
    mocks.createAdminDb.mockReturnValue(db.client);

    const response = await DELETE(request());

    expect(response.status).toBe(200);
    expect(db.rpc.mock.invocationCallOrder[0]).toBeLessThan(db.stagingRemove.mock.invocationCallOrder[0]);
    expect(db.rpc.mock.invocationCallOrder[0]).toBeLessThan(db.publicRemove.mock.invocationCallOrder[0]);
  });

  it('logs a storage cleanup failure but still completes the account deletion', async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: 'auth-user',
      email: 'person@example.com',
      provider: 'supabase',
      actorKey: 'password:stable-actor',
      supabaseUserId: 'auth-user'
    });
    const db = database({
      media: [{ staging_path: 'staged/a.jpg', public_storage_path: 'public/a.webp' }],
      stagingError: { message: 'storage offline' },
      publicError: { message: 'public storage offline' }
    });
    mocks.createAdminDb.mockReturnValue(db.client);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await DELETE(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(db.rpc).toHaveBeenCalledWith('delete_actor_data', { p_actor_key: 'password:stable-actor' });
    expect(db.deleteUser).toHaveBeenCalledWith('auth-user');
    expect(errorSpy).toHaveBeenCalledWith(
      '[account-delete] staging media cleanup failed',
      { actorKey: 'password:stable-actor', error: 'storage offline' }
    );
    expect(errorSpy).toHaveBeenCalledWith(
      '[account-delete] public media cleanup failed',
      { actorKey: 'password:stable-actor', error: 'public storage offline' }
    );
    errorSpy.mockRestore();
  });

  it('fails closed on actor-data RPC errors before deleting the auth identity', async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: 'auth-user',
      email: 'person@example.com',
      provider: 'supabase',
      actorKey: 'password:stable-actor',
      supabaseUserId: 'auth-user'
    });
    const db = database({ rpcError: { message: 'transaction failed' } });
    mocks.createAdminDb.mockReturnValue(db.client);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await DELETE(request());

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('ACCOUNT_DELETE_FAILED');
    expect(db.deleteUser).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      '[account-delete] actor data deletion failed',
      'transaction failed'
    );
    errorSpy.mockRestore();
  });
});

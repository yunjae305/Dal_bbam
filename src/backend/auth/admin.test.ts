import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isolatedTestEnv } from '../../../scripts/test-environment';
import type { CurrentUser } from './current-user';

const currentUser = vi.hoisted(() => vi.fn());
vi.mock('@/backend/auth/current-user', () => ({ getCurrentUser: currentUser }));
import { authorizeAdminRequest, isAdminUser } from './admin';

const demo: CurrentUser = { id: 'fixture', email: 'browser-test@example.com', actorKey: 'demo:fixture', provider: 'demo' };

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  for (const [name, value] of Object.entries(isolatedTestEnv)) vi.stubEnv(name, value);
  currentUser.mockResolvedValue(demo);
});
afterEach(() => vi.unstubAllEnvs());

describe('admin demo boundary', () => {
  it('allows an allowlisted demo only in the isolated browser test harness', () => {
    expect(isAdminUser(demo)).toBe(true);
  });

  it.each(['production', 'development'] as const)('rejects an allowlisted ordinary demo in %s', environment => {
    vi.stubEnv('NODE_ENV', environment);
    vi.stubEnv('DEMO_ISOLATED_TEST', '');
    expect(isAdminUser(demo)).toBe(false);
  });

  it('rejects a test demo once a live database credential appears', async () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', 'external-secret');
    expect(isAdminUser(demo)).toBe(false);
    await expect(authorizeAdminRequest(new Request('https://travel.example/api/admin/shorts'))).resolves.toMatchObject({ authorized: false, method: null });
  });

  it('preserves allowlisted real-user sessions and rejects other users', () => {
    vi.stubEnv('DEMO_ISOLATED_TEST', '');
    expect(isAdminUser({ ...demo, provider: 'supabase' })).toBe(true);
    expect(isAdminUser({ ...demo, email: 'other@example.com', provider: 'supabase' })).toBe(false);
    expect(isAdminUser(null)).toBe(false);
  });

  it('preserves an explicitly supplied strong admin bearer secret', async () => {
    vi.stubEnv('DEMO_ISOLATED_TEST', '');
    vi.stubEnv('ADMIN_API_SECRET', 'server-admin-test-secret-with-32-characters');
    await expect(authorizeAdminRequest(new Request('https://travel.example/api/admin/shorts', {
      headers: { Authorization: 'Bearer server-admin-test-secret-with-32-characters' }
    }))).resolves.toMatchObject({ authorized: true, method: 'secret' });
  });
});

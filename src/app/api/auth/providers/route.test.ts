import { expect, it, vi } from 'vitest';
vi.mock('@/backend/auth/providers', () => ({ getAuthProviderCapabilities: async () => ({ google: false }) }));
import { GET } from './route';

it('exposes only public provider booleans without caching the route response', async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  await expect(response.json()).resolves.toEqual({ google: false });
});

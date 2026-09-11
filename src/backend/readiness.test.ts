import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ inspect: vi.fn(), configured: true }));
vi.mock('@/backend/database-readiness', () => ({ inspectDatabaseReadiness: state.inspect }));
vi.mock('@/backend/supabase/env', () => ({ getSupabaseEnv: () => ({ configured: state.configured, url: 'https://database.example', secretKey: 'private-service-key' }) }));
vi.mock('@/backend/tour-api', () => ({ getGyeongjuTourPlaces: vi.fn(), TourApiError: class extends Error {} }));

describe('runtime database readiness caching and summaries', () => {
  afterEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.useRealTimers(); state.configured = true; });

  it('reports a reachable database with incomplete launch content as unusable, without public diagnostics', async () => {
    state.inspect.mockResolvedValue({ reachable: true, ready: false, schemaReady: true, storageReady: true, contentReady: false, schema: { secret: 'private-service-key' } });
    const { checkDatabase } = await import('./readiness');
    const result = await checkDatabase();
    expect(result).toMatchObject({ configured: true, operational: false, reachable: true, schemaReady: true, storageReady: true, contentReady: false, reason: 'misconfigured' });
    expect(result).not.toHaveProperty('schema');
    expect(JSON.stringify(result)).not.toContain('private-service-key');
  });

  it('deduplicates concurrent reads and expires the bounded 30 second cache', async () => {
    vi.useFakeTimers();
    state.inspect.mockResolvedValue({ reachable: true, ready: true, schemaReady: true, storageReady: true, contentReady: true });
    const { checkDatabase } = await import('./readiness');
    await Promise.all([checkDatabase(), checkDatabase()]);
    await checkDatabase();
    expect(state.inspect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30001);
    await checkDatabase();
    expect(state.inspect).toHaveBeenCalledTimes(2);
  });

  it('fails closed for a thrown probe or missing configuration', async () => {
    state.inspect.mockRejectedValue(new Error('unavailable'));
    const { checkDatabase } = await import('./readiness');
    expect(await checkDatabase()).toMatchObject({ operational: false, reachable: false, schemaReady: false, storageReady: false, contentReady: false });
    state.configured = false;
    expect(await checkDatabase()).toMatchObject({ configured: false, operational: false, reason: 'not_configured' });
    expect(state.inspect).toHaveBeenCalledTimes(1);
  });
});

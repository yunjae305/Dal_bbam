import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ createDb: vi.fn() }));

vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient: mocks.createDb }));

import { GET } from '@/app/api/cron/cleanup/route';

const VALID_SECRET = '0123456789abcdef0123456789abcdef';

function request(secret?: string) {
  return new NextRequest('https://dal-bbam.example/api/cron/cleanup', {
    headers: secret === undefined ? {} : { authorization: `Bearer ${secret}` }
  });
}

function database(options: {
  rows?: Array<{ id: string; staging_path: string | null; public_storage_path?: string | null }>;
  scanError?: { message: string } | null;
  rpcError?: { message: string } | null;
} = {}) {
  const select = vi.fn();
  const eq = vi.fn();
  const lt = vi.fn();
  const limit = vi.fn();
  const update = vi.fn();
  const deleteRows = vi.fn();
  const inIds = vi.fn();
  const gte = vi.fn();
  const spies: Record<string, Mock> = {
    select, eq, is: vi.fn(), lt, gte, not: vi.fn(), limit, update, delete: deleteRows, in: inIds
  };

  // Every table call returns one chainable, awaitable query. Only the
  // `status = 'staged'` scan of community_media yields `options.rows`; every
  // other scan (abandoned/rejected media, stamp artworks) resolves empty.
  const from = vi.fn((table: string) => {
    if (table !== 'community_media' && table !== 'stamp_artworks') {
      throw new Error(`Unexpected table: ${table}`);
    }
    let staged = false;
    const chain: Record<string, unknown> = {
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        const rows = table === 'community_media' && staged ? options.rows ?? [] : [];
        return Promise.resolve({ data: rows, error: options.scanError ?? null }).then(resolve, reject);
      }
    };
    for (const [name, spy] of Object.entries(spies)) {
      chain[name] = (...args: unknown[]) => {
        spy(...args);
        if (name === 'eq' && args[0] === 'status' && args[1] === 'staged') staged = true;
        return chain;
      };
    }
    return chain;
  });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const storageFrom = vi.fn(() => ({ remove }));
  const rpc = vi.fn().mockResolvedValue({
    data: { sessions: 2, rateLimits: 3 },
    error: options.rpcError ?? null
  });

  return {
    client: { from, storage: { from: storageFrom }, rpc },
    select,
    eq,
    lt,
    gte,
    limit,
    update,
    deleteRows,
    inIds,
    storageFrom,
    remove,
    rpc
  };
}

describe('/api/cron/cleanup authorization and cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', VALID_SECRET);
    mocks.createDb.mockReturnValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects missing, short-configured, wrong-length, and mismatched secrets', async () => {
    expect((await GET(request())).status).toBe(403);

    vi.stubEnv('CRON_SECRET', 'too-short');
    expect((await GET(request('too-short'))).status).toBe(403);

    vi.stubEnv('CRON_SECRET', VALID_SECRET);
    expect((await GET(request('short'))).status).toBe(403);
    expect((await GET(request('fedcba9876543210fedcba9876543210'))).status).toBe(403);
    expect(mocks.createDb).not.toHaveBeenCalled();
  });

  it('accepts the exact 32-character bearer secret and cleans expired staging rows', async () => {
    const db = database({
      rows: [
        { id: 'media-1', staging_path: 'actors/a/staged-1.jpg' },
        { id: 'media-2', staging_path: 'actors/a/staged-2.png' }
      ]
    });
    mocks.createDb.mockReturnValue(db.client);

    const response = await GET(request(`  ${VALID_SECRET}  `));

    expect(response.status).toBe(200);
    expect(db.eq).toHaveBeenCalledWith('status', 'staged');
    expect(db.lt).toHaveBeenCalledWith('expires_at', expect.any(String));
    expect(db.limit).toHaveBeenCalledWith(500);
    expect(db.storageFrom).toHaveBeenCalledWith('community-staging');
    expect(db.remove).toHaveBeenCalledWith([
      'actors/a/staged-1.jpg',
      'actors/a/staged-2.png'
    ]);
    expect(db.deleteRows).toHaveBeenCalledOnce();
    expect(db.inIds).toHaveBeenCalledWith('id', ['media-1', 'media-2']);
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    expect(db.rpc).toHaveBeenCalledWith('cleanup_expired_runtime_data');
    await expect(response.json()).resolves.toEqual({
      data: {
        stagedObjectsDeleted: 2,
        abandonedMediaDeleted: 0,
        rejectedMediaDeleted: 0,
        staleArtworkDeleted: 0,
        approvedArtworkStagingDeleted: 0,
        archivedArtworkDeleted: 0,
        database: { sessions: 2, rateLimits: 3 }
      }
    });
  });

  it('bounds the approved-artwork staging sweep to recent approvals', async () => {
    const db = database();
    mocks.createDb.mockReturnValue(db.client);

    const response = await GET(request(VALID_SECRET));

    expect(response.status).toBe(200);
    // Approval already deletes the staging object; only recently approved rows
    // (whose cleanup may have been delayed) are re-swept, never the whole table.
    expect(db.lt).toHaveBeenCalledWith('approved_at', expect.any(String));
    expect(db.gte).toHaveBeenCalledWith('approved_at', expect.any(String));
    const lower = db.gte.mock.calls.find(call => call[0] === 'approved_at')?.[1] as string;
    const upper = db.lt.mock.calls.find(call => call[0] === 'approved_at')?.[1] as string;
    expect(new Date(lower).getTime()).toBeLessThan(new Date(upper).getTime());
    expect(Date.now() - new Date(lower).getTime()).toBeGreaterThanOrEqual(2 * 24 * 60 * 60 * 1000 - 5000);
  });

  it('returns a scan error without mutating storage or runtime data', async () => {
    const db = database({ scanError: { message: 'scan unavailable' } });
    mocks.createDb.mockReturnValue(db.client);

    const response = await GET(request(VALID_SECRET));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'CLEANUP_SCAN_FAILED', message: 'scan unavailable' }
    });
    expect(db.remove).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('surfaces the database cleanup RPC error after staging cleanup', async () => {
    const db = database({
      rows: [{ id: 'media-1', staging_path: 'actors/a/staged.jpg' }],
      rpcError: { message: 'rpc unavailable' }
    });
    mocks.createDb.mockReturnValue(db.client);

    const response = await GET(request(VALID_SECRET));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'CLEANUP_FAILED', message: 'rpc unavailable' }
    });
    expect(db.remove).toHaveBeenCalledOnce();
    expect(db.deleteRows).toHaveBeenCalledOnce();
    expect(db.inIds).toHaveBeenCalledWith('id', ['media-1']);
  });
});

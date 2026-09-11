import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { client, user } = vi.hoisted(() => ({ client: vi.fn(), user: vi.fn() }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient: client }));
vi.mock('@/backend/auth/current-user', () => ({ getCurrentUser: user }));
import { DELETE, GET } from './route';

type Chain = Record<string, ReturnType<typeof vi.fn>>;

function chain(result: unknown, terminal: 'limit' | 'maybeSingle' | 'eq' = 'limit'): Chain {
  const c: Chain = {};
  for (const name of ['select', 'eq', 'order', 'limit', 'delete']) c[name] = vi.fn(() => c);
  c[terminal] = vi.fn(() => terminal === 'limit' && result !== undefined ? Promise.resolve(result) : c);
  c.maybeSingle = vi.fn(() => Promise.resolve(result));
  return c;
}

function database(blocks: Array<{ blocked_actor_key: string; created_at: string }>) {
  const deletes: Array<[string, string]> = [];
  const from = vi.fn((table: string) => {
    if (table === 'community_posts') return chain({ data: { author_name: '경주 여행자' } }, 'maybeSingle');
    const c: Chain = {};
    c.select = vi.fn(() => c);
    c.order = vi.fn(() => c);
    c.limit = vi.fn(() => Promise.resolve({ data: blocks, error: null }));
    const filters: string[] = [];
    c.delete = vi.fn(() => {
      const d: Chain = {};
      d.eq = vi.fn((_column: string, value: string) => {
        filters.push(value);
        if (filters.length === 2) { deletes.push([filters[0], filters[1]]); return Promise.resolve({ error: null }); }
        return d;
      });
      return d;
    });
    c.eq = vi.fn(() => c);
    return c;
  });
  return { from, deletes };
}

const request = (method: string, search = '') =>
  new NextRequest(`http://localhost/api/community/blocks${search}`, { method, headers: { origin: 'http://localhost' } });

describe('blocked users', () => {
  beforeEach(() => { vi.clearAllMocks(); user.mockResolvedValue({ actorKey: 'user:me' }); });

  it('lists the traveler blocks with a name but never the blocked actor key', async () => {
    const db = database([{ blocked_actor_key: 'user:someone-else', created_at: '2026-09-11T06:00:00Z' }]);
    client.mockReturnValue(db);
    const response = await GET(request('GET'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ name: '경주 여행자', blockedAt: '2026-09-11T06:00:00Z' });
    expect(body.data[0].id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(JSON.stringify(body)).not.toContain('someone-else');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('unblocks only through the handle it handed out', async () => {
    const db = database([{ blocked_actor_key: 'user:someone-else', created_at: '2026-09-11T06:00:00Z' }]);
    client.mockReturnValue(db);
    const { data } = await (await GET(request('GET'))).json();

    expect((await DELETE(request('DELETE', '?id=AAAAAAAAAAAAAAAAAAAAAA'))).status).toBe(404);
    expect(db.deletes).toHaveLength(0);

    const response = await DELETE(request('DELETE', `?id=${data[0].id}`));
    expect(response.status).toBe(200);
    expect(db.deletes).toEqual([['user:me', 'user:someone-else']]);
  });

  it('rejects anonymous requests and malformed handles', async () => {
    const db = database([]);
    client.mockReturnValue(db);
    expect((await DELETE(request('DELETE', '?id=not-a-handle'))).status).toBe(400);
    user.mockResolvedValue(null);
    expect((await GET(request('GET'))).status).toBe(401);
    expect(db.from).not.toHaveBeenCalled();
  });
});

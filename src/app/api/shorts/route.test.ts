import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ db: vi.fn(), user: vi.fn(), context: vi.fn(), sample: vi.fn() }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient: mocks.db }));
vi.mock('@/backend/auth/current-user', () => ({ getCurrentUser: mocks.user }));
vi.mock('@/backend/tour-mvp-data', () => ({ getTourMvpData: mocks.sample }));
vi.mock('@/backend/http', async importOriginal => ({
  ...await importOriginal<typeof import('@/backend/http')>(), getUserDataContext: mocks.context
}));
import { GET, POST } from '@/app/api/shorts/route';

const request = (query = '') => new NextRequest(`https://dal-bbam.example/api/shorts${query}`);
const rows = Array.from({ length: 3 }, (_, index) => ({
  id: `short-${index}`, title: `Story ${index}`, narration_id: 'narration', tags: index === 2 ? ['Nature'] : ['History'],
  places: { content_id: String(index) }, short_interactions: []
}));

function database() {
  const range = vi.fn();
  mocks.db.mockReturnValue({ from: () => {
    let lang = 'ko';
    let tags: string[] = [];
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((column: string, value: string) => { if (column === 'lang') lang = value; return query; }),
      overlaps: vi.fn((_column: string, values: string[]) => { tags = values; return query; }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => ({ data: lang === 'ko' ? rows.map(row => ({ tags: row.tags })) : [] })),
      range: vi.fn(async (start: number, end: number) => {
        range(start, end);
        const filtered = tags.length ? rows.filter(row => row.tags.some(tag => tags.includes(tag))) : rows;
        return { data: lang === 'ko' ? filtered.slice(start, end + 1) : [] };
      })
    };
    return query;
  } });
  return range;
}

describe('shorts feed pages and filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.mockReturnValue(null);
    mocks.user.mockResolvedValue(null);
    mocks.context.mockResolvedValue({ user: { actorKey: 'visitor' }, db: {} });
    mocks.sample.mockResolvedValue({ shorts: rows.map(row => ({
      id: row.id, placeId: row.places.content_id, title: row.title, caption: 'Summary', image: '/image.jpg', duration: '01:00', tags: row.tags
    })) });
  });

  it('returns a bounded first page, continuation and stable filter options', async () => {
    const range = database();
    const response = await GET(request('?limit=2'));
    const payload = await response.json();
    expect(payload.data.map((row: { id: string }) => row.id)).toEqual(['short-0', 'short-1']);
    expect(payload.meta).toMatchObject({ nextOffset: 2, tags: ['History', 'Nature'] });
    expect(range).toHaveBeenCalledWith(0, 2);
    const last = await (await GET(request('?limit=2&offset=2'))).json();
    expect(last.data.map((row: { id: string }) => row.id)).toEqual(['short-2']);
    expect(last.meta.nextOffset).toBeNull();
  });

  it('filters case insensitively before pagination while retaining the other tags', async () => {
    database();
    const payload = await (await GET(request('?tag=history&limit=1&offset=1'))).json();
    expect(payload.data.map((row: { id: string }) => row.id)).toEqual(['short-1']);
    expect(payload.meta.tags).toEqual(['History', 'Nature']);
    expect(payload.meta.nextOffset).toBeNull();
  });

  it('returns an empty filtered catalogue without switching to unrelated sample content', async () => {
    database();
    const payload = await (await GET(request('?tag=missing'))).json();
    expect(payload.data).toEqual([]);
    expect(payload.meta.reactionsEnabled).toBe(true);
    expect(mocks.sample).not.toHaveBeenCalled();
  });

  it('identifies the actual language when translated catalogue content is unavailable', async () => {
    database();
    const payload = await (await GET(request('?lang=en'))).json();
    expect(payload.meta.contentLanguage).toBe('ko');
    expect(payload.data).toHaveLength(3);
  });

  it('paginates fallback content and disables persistence for sample rows', async () => {
    const payload = await (await GET(request('?limit=1&offset=1'))).json();
    expect(payload.data.map((row: { id: string }) => row.id)).toEqual(['short-1']);
    expect(payload.meta).toMatchObject({ fallback: true, reactionsEnabled: false, nextOffset: 2 });
  });

  it('includes a shared story beyond the first page while preserving its continuation', async () => {
    const payload = await (await GET(request('?limit=1&focus=short-2'))).json();
    expect(payload.data.map((row: { id: string }) => row.id)).toEqual(['short-2', 'short-0']);
    expect(payload.meta.nextOffset).toBe(1);
  });

  it.each(['?offset=-1', '?offset=1.5', '?limit=0', '?limit=51', '?limit=NaN'])('rejects invalid pagination %s', async query => {
    expect((await GET(request(query))).status).toBe(400);
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it('rejects unknown reaction actions before touching storage', async () => {
    const response = await POST(new NextRequest('https://dal-bbam.example/api/shorts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shortId: 'eb2c0e75-d8de-4d42-86b2-7c20bb645a60', action: 'delete', value: true })
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_REACTION');
  });
});

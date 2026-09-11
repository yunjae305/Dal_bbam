import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createDb: vi.fn(),
  resolvePlace: vi.fn()
}));

vi.mock('@/backend/auth/admin', () => ({ authorizeAdminRequest: mocks.authorize }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient: mocks.createDb }));
vi.mock('@/backend/http', async importOriginal => ({
  ...await importOriginal<typeof import('@/backend/http')>(), resolvePlaceId: mocks.resolvePlace
}));

import { GET, POST, PATCH } from '@/app/api/admin/shorts/route';

function request(headers: Record<string, string> = {}, method = 'POST', body: unknown = {}, query = '') {
  return new NextRequest(`https://dal-bbam.example/api/admin/shorts${query}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) })
  });
}

const SHORT_ID = '123e4567-e89b-42d3-a456-426614174000';
const row = {
  id: SHORT_ID, place_id: 'place-uuid', places: { content_id: 'tour-place-1' },
  title: '첨성대 이야기', summary: '문화재 소개', narration: '', lang: 'ko', is_published: true,
  video_url: '/prepared.mp4', youtube_video_id: null, image_url: null, audio_url: null,
  tags: ['역사'], duration_seconds: 45, narration_id: null,
  created_at: '2026-09-06T00:00:00Z', updated_at: '2026-09-06T01:00:00Z'
};
type DbResult = { data: unknown; error: null | { message: string } };
function database(results: DbResult[]) {
  const queries: Array<ReturnType<typeof makeQuery>> = [];
  const finish = () => results.shift() ?? { data: null, error: null };
  function makeQuery() {
    const query = {
      select: vi.fn(), insert: vi.fn(), update: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn(), range: vi.fn(),
      single: vi.fn(async () => finish()), maybeSingle: vi.fn(async () => finish()),
      then: (resolve: (result: DbResult) => unknown) => Promise.resolve(finish()).then(resolve)
    };
    for (const method of ['select', 'insert', 'update', 'eq', 'is', 'order', 'range'] as const) query[method].mockReturnValue(query);
    return query;
  }
  const db = {
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    from: vi.fn(() => { const query = makeQuery(); queries.push(query); return query; })
  };
  mocks.createDb.mockReturnValue(db);
  return { db, queries };
}

describe('/api/admin/shorts security boundary', () => {
  beforeEach(() => {
    mocks.authorize.mockReset();
    mocks.createDb.mockReset();
    mocks.resolvePlace.mockReset();
  });

  it('rejects cross-site browser mutations before authentication', async () => {
    const response = await POST(request({
      origin: 'https://attacker.example',
      'sec-fetch-site': 'cross-site'
    }));
    expect(response.status).toBe(403);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });

  it('fails closed when common admin authorization rejects the request', async () => {
    mocks.authorize.mockResolvedValue({ authorized: false, user: null, method: null });
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('Bearer');
    expect(mocks.createDb).not.toHaveBeenCalled();
  });

  it('fails closed when the database-backed rate limiter is unavailable', async () => {
    mocks.authorize.mockResolvedValue({ authorized: true, user: null, method: 'secret' });
    mocks.createDb.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'offline' } })
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('RATE_LIMIT_UNAVAILABLE');
  });

  it('returns 429 and Retry-After when the atomic quota is exhausted', async () => {
    mocks.authorize.mockResolvedValue({ authorized: true, user: null, method: 'secret' });
    mocks.createDb.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: false, error: null })
    });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
  });
});

describe('/api/admin/shorts editing contract', () => {
  beforeEach(() => {
    mocks.authorize.mockReset(); mocks.createDb.mockReset(); mocks.resolvePlace.mockReset();
    mocks.authorize.mockResolvedValue({ authorized: true, user: { actorKey: 'admin-session' }, method: 'session' });
    mocks.resolvePlace.mockResolvedValue('place-uuid');
  });

  it('requires admin authentication for draft listing and prevents response caching', async () => {
    mocks.authorize.mockResolvedValue({ authorized: false, user: null, method: null });
    const response = await GET(request({}, 'GET'));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.createDb).not.toHaveBeenCalled();
  });

  it('lists published and draft source metadata with bounded pagination', async () => {
    const { db, queries } = database([{ data: [row, { ...row, id: 'draft', lang: 'en', is_published: false }, { ...row, id: 'extra' }], error: null }]);
    const response = await GET(request({}, 'GET', undefined, '?limit=2'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[1]).toMatchObject({ id: 'draft', lang: 'en', isPublished: false, contentId: 'tour-place-1', imageUrl: null });
    expect(body.meta).toEqual({ limit: 2, offset: 0, hasMore: true, nextOffset: 2 });
    expect(queries[0].range).toHaveBeenCalledWith(0, 2);
    expect(queries[0].order.mock.calls).toEqual([['updated_at', { ascending: false }], ['id', { ascending: false }]]);
    expect(queries[0].eq).not.toHaveBeenCalled();
    expect(queries[0].select.mock.calls[0][0]).not.toContain('short_interactions');
    expect(db.rpc).toHaveBeenCalledWith('consume_api_rate_limit', expect.objectContaining({ p_actor_key: 'admin-session' }));
  });

  it('filters language and draft status and identifies the final page', async () => {
    const { queries } = database([{ data: [{ ...row, lang: 'ja', is_published: false }], error: null }]);
    const response = await GET(request({}, 'GET', undefined, '?lang=ja&status=draft&offset=3&limit=1'));
    expect((await response.json()).meta).toEqual({ limit: 1, offset: 3, hasMore: false, nextOffset: null });
    expect(queries[0].eq.mock.calls).toEqual([['lang', 'ja'], ['is_published', false]]);
    expect(queries[0].range).toHaveBeenCalledWith(3, 4);
  });

  it.each(['?limit=51', '?offset=-1', '?offset=100001', '?lang=xx', '?status=hidden'])('rejects an invalid listing query: %s', async query => {
    const { db } = database([]);
    const response = await GET(request({}, 'GET', undefined, query));
    expect(response.status).toBe(400);
    expect(db.from).not.toHaveBeenCalled();
  });

  it('returns a safe private list error when the schema or DB cannot be read', async () => {
    database([{ data: null, error: { message: 'private database diagnostic' } }]);
    const response = await GET(request({}, 'GET'));
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.text()).not.toContain('private database diagnostic');
  });

  it('creates a prepared video draft without a TTS script and returns editable metadata', async () => {
    const { queries } = database([{ data: { ...row, lang: 'ja', is_published: false }, error: null }]);
    const response = await POST(request({}, 'POST', { contentId: 'tour-place-1', lang: 'ja', title: row.title, summary: row.summary, videoUrl: '/prepared.mp4', isPublished: false }));
    expect(response.status).toBe(201);
    expect(queries[0].insert).toHaveBeenCalledWith(expect.objectContaining({ narration: '', place_id: 'place-uuid', lang: 'ja', is_published: false }));
    expect((await response.json()).data).toMatchObject({ narration: '', lang: 'ja', isPublished: false, imageUrl: null, videoUrl: '/prepared.mp4' });
  });

  it('rejects removing the only media from a published short', async () => {
    const { queries } = database([{ data: row, error: null }]);
    const response = await PATCH(request({}, 'PATCH', { shortId: SHORT_ID, videoUrl: null }));
    expect(response.status).toBe(422);
    expect(queries).toHaveLength(1);
  });

  it('rejects clearing the required script of a published image-only short', async () => {
    const { queries } = database([{ data: { ...row, video_url: null, image_url: '/poster.jpg', narration: 'Existing story' }, error: null }]);
    const response = await PATCH(request({}, 'PATCH', { shortId: SHORT_ID, narration: '' }));
    expect(response.status).toBe(422);
    expect(queries).toHaveLength(1);
  });

  it('can clear the optional script of a stored video and protects the checked row version', async () => {
    const { queries } = database([{ data: row, error: null }, { data: { ...row, narration: '' }, error: null }]);
    const response = await PATCH(request({}, 'PATCH', { shortId: SHORT_ID, narration: '' }));
    expect(response.status).toBe(200);
    expect(queries[1].update).toHaveBeenCalledWith(expect.objectContaining({ narration: '' }));
    expect(queries[1].eq).toHaveBeenCalledWith('updated_at', row.updated_at);
    expect((await response.json()).data).toMatchObject({ lang: 'ko', isPublished: true, narration: '' });
  });

  it('can unpublish an incomplete legacy row', async () => {
    const incomplete = { ...row, video_url: null };
    database([{ data: incomplete, error: null }, { data: { ...incomplete, is_published: false }, error: null }]);
    const response = await PATCH(request({}, 'PATCH', { shortId: SHORT_ID, isPublished: false }));
    expect(response.status).toBe(200);
    expect((await response.json()).data.isPublished).toBe(false);
  });

  it('rejects publishing an incomplete draft', async () => {
    const { queries } = database([{ data: { ...row, video_url: null, is_published: false }, error: null }]);
    const response = await PATCH(request({}, 'PATCH', { shortId: SHORT_ID, isPublished: true }));
    expect(response.status).toBe(422);
    expect(queries).toHaveLength(1);
  });

  it('returns a conflict when another editor changed the validated row', async () => {
    database([{ data: row, error: null }, { data: null, error: null }]);
    const response = await PATCH(request({}, 'PATCH', { shortId: SHORT_ID, title: 'New title' }));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('SHORT_EDIT_CONFLICT');
  });
});

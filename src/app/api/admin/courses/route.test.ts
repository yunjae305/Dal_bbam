import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), db: vi.fn(), resolve: vi.fn() }));
vi.mock('@/backend/auth/admin', () => ({ authorizeAdminRequest: mocks.authorize }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient: mocks.db }));
vi.mock('@/backend/http', async importOriginal => ({ ...await importOriginal<typeof import('@/backend/http')>(), resolvePlaceId: mocks.resolve }));
import { POST, PATCH, DELETE } from '@/app/api/admin/courses/route';

const body = { title: 'Heritage course', description: 'A day of history', transport: 'walking', theme: 'heritage', stops: [{ contentId: 'place', reason: 'History', stayMinutes: 90 }] };
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const request = (value: unknown = body, method = 'POST', headers = {}) => new NextRequest(`https://example.test/api/admin/courses?id=${id}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(method !== 'DELETE' ? { body: JSON.stringify(value) } : {}) });
let rpc: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({ authorized: true, user: null, method: 'secret' });
  rpc = vi.fn().mockResolvedValue({ data: { id }, error: null });
  mocks.db.mockReturnValue({ rpc });
  mocks.resolve.mockResolvedValue('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
});

describe('curated course administration', () => {
  it('requires admin authorization before any write', async () => {
    mocks.authorize.mockResolvedValue({ authorized: false });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('rejects cross-site mutations before checking credentials', async () => {
    expect((await POST(request(body, 'POST', { 'sec-fetch-site': 'cross-site' }))).status).toBe(403);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it('creates an ordered themed course atomically', async () => {
    expect((await POST(request())).status).toBe(201);
    expect(rpc).toHaveBeenCalledWith('save_curated_course', expect.objectContaining({ p_id: null, p_theme: 'heritage', p_title: body.title, p_items: [expect.objectContaining({ order_index: 0, reason: 'History', stay_minutes: 90 })] }));
  });
  it('rejects duplicated, unknown, or malformed stops', async () => {
    expect((await POST(request({ ...body, stops: [body.stops[0], body.stops[0]] }))).status).toBe(422);
    expect((await POST(request({ ...body, stops: [null] }))).status).toBe(422);
    mocks.resolve.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('edits only a curated course and surfaces not-found errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'course_not_found' } });
    expect((await PATCH(request({ ...body, id }, 'PATCH'))).status).toBe(404);
    expect(rpc).toHaveBeenCalledWith('save_curated_course', expect.objectContaining({ p_id: id }));
  });
  it('scopes deletion to curated rows', async () => {
    const chain = { delete: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { id }, error: null }) };
    for (const method of ['delete', 'eq', 'select'] as const) chain[method].mockReturnValue(chain);
    mocks.db.mockReturnValue({ from: vi.fn(() => chain) });
    expect((await DELETE(request(null, 'DELETE'))).status).toBe(200);
    expect(chain.eq).toHaveBeenCalledWith('is_curated', true);
  });
});

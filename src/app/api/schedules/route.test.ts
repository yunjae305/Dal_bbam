import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ context: vi.fn(), resolve: vi.fn() }));
vi.mock('@/backend/http', async importOriginal => ({
  ...await importOriginal<typeof import('@/backend/http')>(), getUserDataContext: mocks.context, resolvePlaceId: mocks.resolve
}));
import { POST } from '@/app/api/schedules/route';
import { PATCH } from '@/app/api/schedules/[id]/route';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actor = 'supabase:owner';
const item = { contentId: 'place-1', visitDate: '2026-09-06', startTime: '09:00', stayMinutes: 60 };
const request = (body: unknown, method = 'POST') => new NextRequest(`https://example.test/api/schedules${method === 'PATCH' ? `/${id}` : ''}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
let rpc: ReturnType<typeof vi.fn>;
let chain: Record<string, ReturnType<typeof vi.fn>>;
let from: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  rpc = vi.fn().mockResolvedValue({ data: { id }, error: null });
  chain = {};
  for (const name of ['select', 'eq', 'update']) chain[name] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: { id, start_date: '2026-09-06', end_date: '2026-09-07' }, error: null });
  chain.single = vi.fn().mockResolvedValue({ data: { id }, error: null });
  from = vi.fn(() => chain);
  mocks.context.mockResolvedValue({ user: { actorKey: actor }, db: { from, rpc } });
  mocks.resolve.mockResolvedValue('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
});

describe('schedule creation with an AI draft', () => {
  it('writes metadata and all dated visits in one transaction under the authenticated owner', async () => {
    const response = await POST(request({ title: 'Trip', startDate: '2026-09-06', endDate: '2026-09-07', actorKey: 'attacker', items: [item, { ...item, visitDate: '2026-09-07' }] }));
    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith('create_schedule_with_places', expect.objectContaining({ p_actor_key: actor, p_start_date: '2026-09-06', p_end_date: '2026-09-07', p_items: [expect.objectContaining({ visit_date: '2026-09-06', start_time: '09:00', sort_order: 0 }), expect.objectContaining({ visit_date: '2026-09-07', sort_order: 1 })] }));
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    { ...item, visitDate: '2026-09-08' }, { ...item, startTime: '25:00' }, { ...item, stayMinutes: -1 }, { ...item, stayMinutes: 241 }, { ...item, visitDate: '2026-02-30' }
  ])('rejects invalid visit inputs without writing %#', async invalid => {
    expect((await POST(request({ title: 'Trip', startDate: '2026-09-06', endDate: '2026-09-07', items: [invalid] }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects duplicate visits on the same date', async () => {
    const response = await POST(request({ title: 'Trip', startDate: '2026-09-06', items: [item, item] }));
    expect((await response.json()).error.code).toBe('DUPLICATE_SCHEDULE_PLACE');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not create an empty schedule when a stop cannot be resolved', async () => {
    mocks.resolve.mockResolvedValue(null);
    expect((await POST(request({ title: 'Trip', startDate: '2026-09-06', items: [item] }))).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('atomic schedule edits', () => {
  it('updates dates and visits using one RPC without a separate header mutation', async () => {
    const response = await PATCH(request({ title: 'Edited', endDate: '2026-09-08', items: [{ ...item, visitDate: '2026-09-08' }] }, 'PATCH'), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('update_schedule_with_places', expect.objectContaining({ p_schedule_id: id, p_actor_key: actor, p_patch: expect.objectContaining({ title: 'Edited', end_date: '2026-09-08' }), p_items: [expect.objectContaining({ visit_date: '2026-09-08' })] }));
    expect(chain.update).not.toHaveBeenCalled();
  });

  it('does not mutate an unowned schedule', async () => {
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await PATCH(request({ items: [] }, 'PATCH'), { params: Promise.resolve({ id }) })).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports transaction failure without reporting successful save', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'transaction failed' } });
    expect((await PATCH(request({ title: 'Edited', items: [] }, 'PATCH'), { params: Promise.resolve({ id }) })).status).toBe(500);
    expect(chain.single).not.toHaveBeenCalled();
  });
});

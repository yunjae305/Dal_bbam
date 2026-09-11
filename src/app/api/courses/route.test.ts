import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ context: vi.fn(), resolve: vi.fn() }));
vi.mock('@/backend/http', async importOriginal => ({ ...await importOriginal<typeof import('@/backend/http')>(), getUserDataContext: mocks.context, resolvePlaceId: mocks.resolve }));
import { POST } from '@/app/api/courses/route';

const request = (body: unknown) => new NextRequest('https://example.test/api/courses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const courseBody = { title: 'Course', contentIds: ['place-1', 'place-2'], reasons: ['First', 'Second'], stayMinutes: [60, 90] };

describe('course saving', () => {
  let courseChain: Record<string, ReturnType<typeof vi.fn>>;
  let stopsChain: { insert: ReturnType<typeof vi.fn> };
  let from: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.clearAllMocks();
    courseChain = {};
    for (const method of ['insert', 'select', 'delete', 'eq']) courseChain[method] = vi.fn(() => courseChain);
    courseChain.single = vi.fn().mockResolvedValue({ data: { id: 'course-1', share_token: 'share' }, error: null });
    stopsChain = { insert: vi.fn().mockResolvedValue({ error: null }) };
    from = vi.fn((table: string) => table === 'courses' ? courseChain : stopsChain);
    mocks.context.mockResolvedValue({ user: { actorKey: 'supabase:owner' }, db: { from } });
    mocks.resolve.mockImplementation(async (_db, id) => `${id}-uuid`);
  });
  it.each([
    { ...courseBody, contentIds: ['place-1', 'place-1'] }, { ...courseBody, reasons: ['Only one'] },
    { ...courseBody, contentIds: [] }, { ...courseBody, stayMinutes: [1, 90] },
    { ...courseBody, isAiGenerated: 'true' }, { ...courseBody, title: 'x'.repeat(81) }
  ])('rejects malformed saved course metadata without partial writes %#', async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });
  it('keeps reasons and duration attached to their ordered place and generates a private owner', async () => {
    expect((await POST(request({ ...courseBody, actorKey: 'attacker', isCurated: true }))).status).toBe(201);
    expect(courseChain.insert).toHaveBeenCalledWith(expect.objectContaining({ actor_key: 'supabase:owner', share_token: expect.stringMatching(/^[a-f0-9]{32}$/) }));
    expect(courseChain.insert.mock.calls[0][0]).not.toHaveProperty('is_curated');
    expect(stopsChain.insert).toHaveBeenCalledWith([
      expect.objectContaining({ place_id: 'place-1-uuid', order_index: 0, reason: 'First', stay_minutes: 60 }),
      expect.objectContaining({ place_id: 'place-2-uuid', order_index: 1, reason: 'Second', stay_minutes: 90 })
    ]);
  });
  it('removes a new course when its places could not be saved', async () => {
    stopsChain.insert.mockResolvedValue({ error: { message: 'write rejected' } });
    expect((await POST(request(courseBody))).status).toBe(500);
    expect(courseChain.delete).toHaveBeenCalled();
    expect(courseChain.eq).toHaveBeenCalledWith('actor_key', 'supabase:owner');
  });
});

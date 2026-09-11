import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { dbClient, user, generate, moderate } = vi.hoisted(() => ({ dbClient: vi.fn(), user: vi.fn(), generate: vi.fn(), moderate: vi.fn() }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient: dbClient }));
vi.mock('@/backend/auth/current-user', () => ({ getCurrentUser: user }));
vi.mock('@/backend/openai', () => ({ generateStructured: generate, moderateContent: moderate }));
import { POST } from './route';

const mediaId = 'd2a0b5c2-0c0c-4e11-bfa1-09859814c111';
const request = () => new NextRequest('http://localhost/api/community/story', { method: 'POST', body: JSON.stringify({ mediaId, lang: 'ja', notes: '문화재 여행' }) });

describe('visitor photo story drafts', () => {
  const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  const db = { from: vi.fn(() => q), rpc: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks();
    user.mockResolvedValue({ actorKey: 'demo:user' });
    q.select.mockReturnValue(q); q.eq.mockReturnValue(q);
    q.maybeSingle.mockResolvedValue({ data: { public_path: 'https://storage.example.com/photo.jpg' } });
    db.rpc.mockResolvedValue({ data: true, error: null });
    dbClient.mockReturnValue(db);
    moderate.mockResolvedValue({ allowed: true });
    generate.mockResolvedValue({ value: { title: '文化遺産', content: '写真の風景', tags: ['文化'] } });
  });

  it('generates in the requested language from an approved owned photo without publishing', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(q.eq).toHaveBeenCalledWith('actor_key', 'demo:user');
    expect(q.eq).toHaveBeenCalledWith('status', 'approved');
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ instructions: expect.stringContaining('Write in ja.') }));
    expect(moderate).toHaveBeenCalledTimes(2);
    await expect(response.json()).resolves.toMatchObject({ data: { status: 'draft', requiresExplicitPublish: true, mediaId } });
    expect(db.rpc).not.toHaveBeenCalledWith('create_community_post', expect.anything());
  });

  it('rejects inaccessible photos before generation', async () => {
    q.maybeSingle.mockResolvedValue({ data: null });
    expect((await POST(request())).status).toBe(422);
    expect(generate).not.toHaveBeenCalled();
  });

  it('does not send unsafe notes to the story generator', async () => {
    moderate.mockResolvedValue({ allowed: false });
    expect((await POST(request())).status).toBe(422);
    expect(generate).not.toHaveBeenCalled();
  });

  it('does not return an unsafe generated draft', async () => {
    moderate.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false });
    const response = await POST(request());
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'MODERATION_REJECTED' } });
  });
});

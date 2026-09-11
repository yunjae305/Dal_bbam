import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { client, user } = vi.hoisted(() => ({ client: vi.fn(), user: vi.fn() }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient: client }));
vi.mock('@/backend/auth/current-user', () => ({ getCurrentUser: user }));
import { PUT } from './route';

const id = 'd2a0b5c2-0c0c-4e11-bfa1-09859814c111';
const request = (bookmarked: boolean) => new NextRequest(`http://localhost/api/community/${id}/bookmark`, { method: 'PUT', body: JSON.stringify({ bookmarked }) });

describe('community bookmarks', () => {
  beforeEach(() => { vi.clearAllMocks(); user.mockResolvedValue({ actorKey: 'demo:reader' }); });

  it('upserts only the current traveler bookmark for an existing published post', async () => {
    const post = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { id } }) };
    post.select.mockReturnValue(post); post.eq.mockReturnValue(post);
    const bookmark = { upsert: vi.fn().mockResolvedValue({ error: null }) };
    client.mockReturnValue({ from: vi.fn((table: string) => table === 'community_posts' ? post : bookmark) });
    const response = await PUT(request(true), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect(post.eq).toHaveBeenCalledWith('status', 'published');
    expect(bookmark.upsert).toHaveBeenCalledWith({ actor_key: 'demo:reader', post_id: id }, { onConflict: 'actor_key,post_id' });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('rejects anonymous bookmark writes', async () => {
    user.mockResolvedValue(null);
    const from = vi.fn(); client.mockReturnValue({ from });
    expect((await PUT(request(true), { params: Promise.resolve({ id }) })).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it('does not bookmark a missing or unpublished post', async () => {
    const post = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null }) };
    post.select.mockReturnValue(post); post.eq.mockReturnValue(post);
    const from = vi.fn(() => post); client.mockReturnValue({ from });
    expect((await PUT(request(true), { params: Promise.resolve({ id }) })).status).toBe(404);
    expect(from).not.toHaveBeenCalledWith('community_bookmarks');
  });
});

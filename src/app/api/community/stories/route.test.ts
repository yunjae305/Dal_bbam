import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbClient, user } = vi.hoisted(() => ({ dbClient: vi.fn(), user: vi.fn() }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient: dbClient }));
vi.mock('@/backend/auth/current-user', () => ({ getCurrentUser: user }));
import { GET } from './route';

function chain(data: unknown, error: unknown = null) {
  const result = { data, error };
  const q = {
    select: vi.fn(), eq: vi.fn(), gte: vi.fn(), order: vi.fn(), limit: vi.fn(),
    then: (resolve: (result: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of [q.select, q.eq, q.gte, q.order, q.limit]) method.mockReturnValue(q);
  return q;
}

describe('published visitor photo stories', () => {
  beforeEach(() => { vi.clearAllMocks(); user.mockResolvedValue(null); });

  it('requires published, recent, approved photos linked to heritage sites', async () => {
    const posts = chain([]);
    dbClient.mockReturnValue({ from: vi.fn(() => posts) });
    const before = Date.now();
    const response = await GET();
    expect(response.status).toBe(200);
    expect(posts.select).toHaveBeenCalledWith(expect.stringContaining('community_media!inner'));
    expect(posts.select).toHaveBeenCalledWith(expect.stringContaining('places!inner'));
    expect(posts.eq).toHaveBeenCalledWith('status', 'published');
    expect(posts.eq).toHaveBeenCalledWith('places.category', 'heritage');
    expect(posts.eq).toHaveBeenCalledWith('community_media.status', 'approved');
    const cutoff = new Date(posts.gte.mock.calls[0][1]).getTime();
    expect(cutoff).toBeGreaterThanOrEqual(before - 7 * 24 * 3600 * 1000);
    expect(posts.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('removes blocked authors and keeps the response private for a signed-in traveler', async () => {
    user.mockResolvedValue({ actorKey: 'reader' });
    const post = { id: 'post', actor_key: 'author', category: 'review', title: '스토리', content: '사진 후기', rating: null, author_name: '여행자', created_at: '2026-09-06', updated_at: '2026-09-06', places: { content_id: '123', name: '불국사', category: 'heritage' }, community_media: [{ public_path: 'https://example.com/photo.jpg' }] };
    const posts = chain([post, { ...post, id: 'blocked', actor_key: 'blocked-author' }]);
    const blocks = chain([{ blocked_actor_key: 'blocked-author' }]);
    dbClient.mockReturnValue({ from: vi.fn((table: string) => table === 'user_blocks' ? blocks : posts) });
    const response = await GET();
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: 'post', placeName: '불국사', mediaUrls: ['https://example.com/photo.jpg'] });
  });
});

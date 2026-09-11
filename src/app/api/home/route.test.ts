import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ db: vi.fn(), rpc: vi.fn() }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient: mocks.db }));
vi.mock('@/backend/tour-mvp-data', () => ({ getTourMvpData: async () => ({ places: ['first', 'popular'].map(contentId => ({
  contentId, name: contentId, category: 'heritage', tags: [], coordinates: [35.8, 129.2], image: '/icon.svg', description: '', address: ''
})) }) }));
import { GET } from '@/app/api/home/route';

describe('home view ranking', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('uses aggregated counts including more than 5,000 views and refreshes once per minute', async () => {
    mocks.db.mockReturnValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: [{ content_id: 'popular', view_count: 9000 }, { content_id: 'first', view_count: 1 }], error: null });
    const response = await GET(new NextRequest('http://localhost/api/home?lang=en'));
    const payload = await response.json();
    expect(payload.data.popular.map((place: { contentId: string }) => place.contentId)).toEqual(['popular', 'first']);
    expect(mocks.rpc).toHaveBeenCalledWith('get_place_view_ranking', { since_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(response.headers.get('cache-control')).toContain('s-maxage=60');
  });
  it('keeps public browsing available without a configured database', async () => {
    mocks.db.mockReturnValue(null);
    const response = await GET(new NextRequest('http://localhost/api/home'));
    expect(response.status).toBe(200);
    expect((await response.json()).data.popular).toHaveLength(2);
  });
});

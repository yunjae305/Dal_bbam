import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createDb: vi.fn() }));

vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient: mocks.createDb }));

import { getSupabasePlaces, normalizePlaceCategory, PLACE_QUERY_LIMIT } from '@/backend/supabase/places';

describe('normalizePlaceCategory', () => {
  it('keeps category codes stable', () => {
    expect(normalizePlaceCategory('heritage')).toBe('heritage');
    expect(normalizePlaceCategory('food')).toBe('food');
  });

  it('migrates legacy Korean labels', () => {
    expect(normalizePlaceCategory('문화재')).toBe('heritage');
    expect(normalizePlaceCategory('음식점')).toBe('food');
    expect(normalizePlaceCategory('숙박')).toBe('lodging');
  });

  it('uses attraction for unknown values', () => {
    expect(normalizePlaceCategory('unknown')).toBe('attraction');
    expect(normalizePlaceCategory(null)).toBe('attraction');
  });
});

describe('getSupabasePlaces', () => {
  const order = vi.fn();
  const limit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'secret');
    const chain: Record<string, unknown> = {
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve({
          data: [{ id: 'row-1', content_id: '100', category: 'heritage', name: '첨성대', lat: 35.83, lng: 129.21 }],
          error: null
        }).then(resolve, reject);
      }
    };
    chain.select = () => chain;
    chain.order = (...args: unknown[]) => { order(...args); return chain; };
    chain.limit = (...args: unknown[]) => { limit(...args); return chain; };
    mocks.createDb.mockReturnValue({ from: () => chain });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the whole catalogue with a deterministic order so in-memory search sees every row', async () => {
    const places = await getSupabasePlaces('ko');

    expect(places.map(place => place.contentId)).toEqual(['100']);
    expect(PLACE_QUERY_LIMIT).toBeGreaterThanOrEqual(1000);
    expect(limit).toHaveBeenCalledWith(PLACE_QUERY_LIMIT);
    expect(order.mock.calls).toEqual([
      ['created_at', { ascending: false }],
      ['name', { ascending: true }]
    ]);
  });
});

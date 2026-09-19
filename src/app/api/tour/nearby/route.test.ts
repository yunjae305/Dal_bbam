import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const mocks = vi.hoisted(() => ({ nearby: vi.fn() }));
vi.mock('@/backend/tour-api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/backend/tour-api')>()),
  getNearbyTourPlaces: mocks.nearby
}));

function request(mapX: string, mapY: string) {
  return new NextRequest(`http://localhost:3000/api/tour/nearby?mapX=${mapX}&mapY=${mapY}`);
}

describe('nearby attractions', () => {
  afterEach(() => vi.clearAllMocks());

  it('refuses coordinates outside Gyeongju so another city never appears as nearby', async () => {
    // 서울 양천구
    const response = await GET(request('126.8562', '37.5266'));
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('OUTSIDE_GYEONGJU');
    expect(mocks.nearby).not.toHaveBeenCalled();
  });

  it('asks the provider for places around a Gyeongju point', async () => {
    mocks.nearby.mockResolvedValue({ items: [], totalCount: 0 });
    const response = await GET(request('129.2247', '35.8562'));
    expect(response.status).toBe(200);
    expect(mocks.nearby).toHaveBeenCalledWith(expect.objectContaining({ mapX: '129.2247', mapY: '35.8562' }));
  });
});

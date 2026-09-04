import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabasePlaces: vi.fn(),
  getGyeongjuTourPlaces: vi.fn(),
  searchGyeongjuFestivals: vi.fn(),
  getTourPlaceDetail: vi.fn()
}));

vi.mock('@/backend/supabase/places', () => ({ getSupabasePlaces: mocks.getSupabasePlaces }));
vi.mock('@/backend/tour-api', () => ({
  getGyeongjuTourPlaces: mocks.getGyeongjuTourPlaces,
  searchGyeongjuFestivals: mocks.searchGyeongjuFestivals,
  getTourPlaceDetail: mocks.getTourPlaceDetail
}));

import { getTourMvpData, mapTourPlaceSummary } from '@/backend/tour-mvp-data';

function tourResult(items: Array<Record<string, string>>) {
  return {
    items,
    pageNo: 1,
    numOfRows: items.length,
    totalCount: items.length,
    cache: { hit: false, ttlSeconds: 1, cachedAt: '2026-09-04T00:00:00.000Z' }
  };
}

describe('nearby TourAPI place mapping', () => {
  it('maps provider longitude/latitude and distance into the shared place model', () => {
    const place = mapTourPlaceSummary({
      contentid: '125780',
      contenttypeid: '14',
      title: '테스트 문화유산',
      addr1: '경상북도 경주시',
      mapx: '129.2247',
      mapy: '35.8562',
      dist: '320',
      firstimage: 'https://example.com/place.jpg'
    });

    expect(place).toMatchObject({
      contentId: '125780',
      category: 'heritage',
      distance: '320m',
      coordinates: [35.8562, 129.2247],
      source: 'tour-api'
    });
  });

  it('falls back to the Gyeongju centre when mapx/mapy are empty instead of plotting [0, 0]', () => {
    const empty = mapTourPlaceSummary({ contentid: '1', title: '좌표 없음', mapx: '', mapy: '' });
    const missing = mapTourPlaceSummary({ contentid: '2', title: '좌표 없음' });
    const blank = mapTourPlaceSummary({ contentid: '3', title: '좌표 없음', mapx: '  ', mapy: null });

    for (const place of [empty, missing, blank]) {
      expect(place.coordinates).toEqual([35.8562, 129.2247]);
    }
  });
});

describe('getTourMvpData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSupabasePlaces.mockResolvedValue([]);
    mocks.getTourPlaceDetail.mockResolvedValue(tourResult([]));
    mocks.searchGyeongjuFestivals.mockResolvedValue(tourResult([]));
    mocks.getGyeongjuTourPlaces.mockImplementation(async ({ contentTypeId }: { contentTypeId?: string }) =>
      tourResult(contentTypeId === '12'
        ? [{ contentid: '9001', contenttypeid: '12', title: '실제 관광지', mapx: '129.2', mapy: '35.8' }]
        : [])
    );
  });

  it('reuses the Korean TourAPI catalogue for non-Korean locales instead of the sample slugs', async () => {
    const data = await getTourMvpData('en');

    expect(mocks.getGyeongjuTourPlaces).toHaveBeenCalled();
    expect(data.places.map(place => place.contentId)).toEqual(['9001']);
    expect(data.places[0]).toMatchObject({ source: 'tour-api', translations: { en: { name: '실제 관광지' } } });
  });

  it('still returns the sample catalogue when TourAPI has nothing', async () => {
    mocks.getGyeongjuTourPlaces.mockResolvedValue(tourResult([]));

    const data = await getTourMvpData('ja');

    expect(data.places.length).toBeGreaterThan(0);
    expect(data.places.every(place => place.source !== 'tour-api')).toBe(true);
  });
});

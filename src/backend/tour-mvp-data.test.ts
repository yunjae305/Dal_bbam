import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { mapTourPlaceSummary, PUBLIC_CATALOGUE_BUDGET_MS, PUBLIC_CATALOGUE_FRESH_MS } from '@/backend/tour-mvp-data';
let getTourMvpData: typeof import('@/backend/tour-mvp-data').getTourMvpData;

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
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T00:00:00Z'));
    vi.clearAllMocks();
    mocks.getSupabasePlaces.mockResolvedValue([]);
    mocks.getTourPlaceDetail.mockResolvedValue(tourResult([]));
    mocks.searchGyeongjuFestivals.mockResolvedValue(tourResult([]));
    mocks.getGyeongjuTourPlaces.mockImplementation(async ({ contentTypeId }: { contentTypeId?: string }) =>
      tourResult(contentTypeId === '12'
        ? [{ contentid: '9001', contenttypeid: '12', title: '실제 관광지', mapx: '129.2', mapy: '35.8' }]
        : [])
    );
    ({ getTourMvpData } = await import('@/backend/tour-mvp-data'));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
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
    expect(data.catalogue).toMatchObject({ source: 'sample', fallback: true, stale: false });
  });

  it('returns an explicitly marked sample at the cold-start budget and accepts a late provider recovery', async () => {
    let recover!: (places: ReturnType<typeof mapTourPlaceSummary>[]) => void;
    mocks.getSupabasePlaces.mockImplementation(() => new Promise(resolve => { recover = resolve; }));
    let completed = false;
    const request = getTourMvpData('en').then(data => { completed = true; return data; });
    await vi.advanceTimersByTimeAsync(PUBLIC_CATALOGUE_BUDGET_MS - 1);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const sample = await request;
    expect(sample.catalogue).toMatchObject({ source: 'sample', fallback: true });
    expect(sample.places.every(place => place.source === 'sample')).toBe(true);
    recover([{ ...mapTourPlaceSummary({ contentid: 'recovered', title: 'Recovered place' }), source: 'database' }]);
    await vi.advanceTimersByTimeAsync(0);
    const recovered = await getTourMvpData('en');
    expect(recovered.catalogue).toMatchObject({ source: 'database', fallback: false, stale: false });
    expect(recovered.places[0].contentId).toBe('recovered');
    expect(mocks.getSupabasePlaces).toHaveBeenCalledTimes(1);
  });

  it('bounds response time when the list loaded but the detail phase stalls', async () => {
    let finishDetail!: (result: ReturnType<typeof tourResult>) => void;
    mocks.getTourPlaceDetail.mockImplementation(() => new Promise(resolve => { finishDetail = resolve; }));
    const request = getTourMvpData('ko');
    await vi.advanceTimersByTimeAsync(PUBLIC_CATALOGUE_BUDGET_MS);
    expect((await request).catalogue.source).toBe('sample');
    finishDetail(tourResult([{ overview: 'Recovered official overview' }]));
    await vi.advanceTimersByTimeAsync(0);
    const recovered = await getTourMvpData('ko');
    expect(recovered.catalogue.source).toBe('tour-api');
    expect(recovered.places[0].description).toBe('Recovered official overview');
  });

  it('coalesces 100 simultaneous catalogue requests into one provider pipeline', async () => {
    const responses = await Promise.all(Array.from({ length: 100 }, () => getTourMvpData('ko')));
    expect(mocks.getSupabasePlaces).toHaveBeenCalledTimes(1);
    expect(mocks.getGyeongjuTourPlaces).toHaveBeenCalledTimes(3);
    expect(mocks.searchGyeongjuFestivals).toHaveBeenCalledTimes(1);
    expect(mocks.getTourPlaceDetail).toHaveBeenCalledTimes(1);
    expect(responses.every(data => data.catalogue.source === 'tour-api')).toBe(true);
    await getTourMvpData('ko');
    expect(mocks.getSupabasePlaces).toHaveBeenCalledTimes(1);
  });

  it('keeps locale caches and each caller response isolated', async () => {
    mocks.getSupabasePlaces.mockImplementation(async (lang: string) => [{
      ...mapTourPlaceSummary({ contentid: 'localized', title: `Title ${lang}` }), source: 'database'
    }]);
    const english = await getTourMvpData('en');
    const japanese = await getTourMvpData('ja');
    english.places[0].name = 'Accidental caller mutation';
    expect((await getTourMvpData('en')).places[0].name).toBe('Title en');
    expect(japanese.places[0].name).toBe('Title ja');
    expect(mocks.getSupabasePlaces).toHaveBeenCalledTimes(2);
  });

  it('serves stale live data during an outage and refreshes successfully after retry', async () => {
    const initial = await getTourMvpData('ko');
    mocks.getGyeongjuTourPlaces.mockRejectedValue(new Error('Provider outage'));
    mocks.searchGyeongjuFestivals.mockRejectedValue(new Error('Provider outage'));
    await vi.advanceTimersByTimeAsync(PUBLIC_CATALOGUE_FRESH_MS + 1);
    const stale = await getTourMvpData('ko');
    expect(stale.catalogue).toMatchObject({ source: 'tour-api', fallback: false, stale: true });
    expect(stale.places[0].contentId).toBe('9001');
    await vi.advanceTimersByTimeAsync(0);
    expect((await getTourMvpData('ko')).catalogue).toMatchObject({ stale: true, fetchedAt: initial.catalogue.fetchedAt });
    mocks.getSupabasePlaces.mockResolvedValue([{ ...mapTourPlaceSummary({ contentid: 'new', title: 'Recovered' }), source: 'database' }]);
    await vi.advanceTimersByTimeAsync(5001);
    await getTourMvpData('ko');
    await vi.advanceTimersByTimeAsync(0);
    const recovered = await getTourMvpData('ko');
    expect(recovered.places[0].contentId).toBe('new');
    expect(recovered.catalogue).toMatchObject({ source: 'database', fallback: false, stale: false });
  });

  it('recovers after a permanently stalled refresh reaches its hard timeout', async () => {
    mocks.getSupabasePlaces.mockImplementation(() => new Promise(() => {}));
    const cold = getTourMvpData('ko');
    await vi.advanceTimersByTimeAsync(PUBLIC_CATALOGUE_BUDGET_MS);
    await cold;
    await vi.advanceTimersByTimeAsync(35_000);
    mocks.getSupabasePlaces.mockResolvedValue([{ ...mapTourPlaceSummary({ contentid: 'retry', title: 'After timeout' }), source: 'database' }]);
    await vi.advanceTimersByTimeAsync(5001);
    await getTourMvpData('ko');
    await vi.advanceTimersByTimeAsync(0);
    expect((await getTourMvpData('ko')).places[0].contentId).toBe('retry');
    expect(mocks.getSupabasePlaces).toHaveBeenCalledTimes(2);
  });
});

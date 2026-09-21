import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/maps/places/route';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function kakaoResponse() {
  return new Response(JSON.stringify({
    meta: { total_count: 1, pageable_count: 1, is_end: true },
    documents: [{
      id: '12345',
      place_name: '경주 카카오 명소',
      category_name: '여행 > 관광명소',
      category_group_code: 'AT4',
      category_group_name: '관광명소',
      phone: '054-000-0000',
      address_name: '경북 경주시 황남동',
      road_address_name: '경북 경주시 포석로',
      x: '129.2247',
      y: '35.8562',
      place_url: 'http://place.map.kakao.com/12345',
      distance: '240'
    }]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('Kakao Places proxy', () => {
  it('searches by keyword inside the current map bounds', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'rest-key');
    const fetchMock = vi.fn().mockResolvedValue(kakaoResponse());
    vi.stubGlobal('fetch', fetchMock);
    const request = new NextRequest(
      'http://localhost/api/maps/places?query=%EB%B6%88%EA%B5%AD%EC%82%AC&south=35.7&west=129.0&north=36.0&east=129.4'
    );

    const first = await GET(request);
    const second = await GET(request);
    const payload = await first.json();
    const cached = await second.json();

    expect(first.status).toBe(200);
    expect(payload.data.places[0]).toMatchObject({
      id: '12345',
      name: '경주 카카오 명소',
      lat: 35.8562,
      lng: 129.2247,
      placeUrl: 'https://place.map.kakao.com/12345'
    });
    const upstream = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(upstream.pathname).toContain('/local/search/keyword.json');
    expect(upstream.searchParams.get('rect')).toBe('129,35.7,129.4,36');
    expect(cached.meta.cacheHit).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('supports Kakao category search around the Gyeongju center', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'rest-key');
    const fetchMock = vi.fn().mockResolvedValue(kakaoResponse());
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(new NextRequest('http://localhost/api/maps/places?category=FD6'));
    const payload = await response.json();
    const upstream = new URL(String(fetchMock.mock.calls[0]?.[0]));

    expect(response.status).toBe(200);
    expect(payload.data.category).toBe('FD6');
    expect(upstream.pathname).toContain('/local/search/category.json');
    expect(upstream.searchParams.get('radius')).toBe('20000');
  });

  it('searches Seoul bounds and keeps places outside Gyeongju', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'rest-key');
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ documents: [{ id: 'seoul', place_name: '서울시청', x: '126.978', y: '37.5665' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(new NextRequest(
      'http://localhost/api/maps/places?category=AT4&south=37.4&west=126.8&north=37.7&east=127.2'
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.places[0]).toMatchObject({ name: '서울시청', lat: 37.5665 });
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('rect')).toBe('126.8,37.4,127.2,37.7');
  });

  it('does not restrict nationwide keyword searches to the Gyeongju radius', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'rest-key');
    const fetchMock = vi.fn().mockResolvedValue(kakaoResponse());
    vi.stubGlobal('fetch', fetchMock);
    expect((await GET(new NextRequest('http://localhost/api/maps/places?query=Seoul'))).status).toBe(200);
    const params = new URL(String(fetchMock.mock.calls[0][0])).searchParams;
    expect(params.has('radius')).toBe(false);
    expect(params.has('x')).toBe(false);
    expect(params.get('sort')).toBe('accuracy');
  });

  it('still rejects invalid map bounds', async () => {
    const response = await GET(new NextRequest('http://localhost/api/maps/places?category=AT4&south=95&west=126&north=96&east=127'));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_BOUNDS');
  });

  it('requires either a keyword or category', async () => {
    const response = await GET(new NextRequest('http://localhost/api/maps/places'));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('SEARCH_REQUIRED');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { type DirectionMode } from '@/shared/directions';

beforeEach(() => vi.resetModules());
async function GET(input: NextRequest) {
  return (await import('@/app/api/maps/directions/route')).GET(input);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function request(mode: DirectionMode, overrides: Record<string, string> = {}) {
  const params = new URLSearchParams({
    originLat: '35.8562',
    originLng: '129.2247',
    destinationLat: '35.857548',
    destinationLng: '129.2247',
    destinationName: '불국사',
    mode,
    ...overrides
  });
  return new NextRequest(`http://localhost/api/maps/directions?${params}`);
}

describe('map directions', () => {
  it('keeps a clearly labelled walking fallback when Kakao is not configured', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', '');
    const response = await GET(request('walking'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.source).toBe('straight-line-estimate');
    expect(payload.data.distanceMeters).toBeGreaterThan(149);
    expect(payload.data.appUrl).toContain('by=foot');
    expect(payload.data.webFallbackUrl).toContain('/link/by/walk/');
  });

  it('returns a deterministic car fallback when Kakao is not configured', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', '');
    const response = await GET(request('car'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.meta.fallback).toBe(true);
    expect(payload.data.source).toBe('straight-line-fallback');
  });

  it.each([
    ['walking', 'walk'],
    ['bicycle', 'bicycle']
  ] as const)('uses the Kakao Map %s route and converts [lng,lat] paths', async (mode, endpoint) => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'rest-key');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'OK',
      route: {
        properties: { totalDistance: 430, totalTime: 320 },
        legs: [{ steps: [{ path: { points: [[129.2247, 35.8562], [129.225, 35.857]] } }] }]
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(request(mode));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.source).toBe(`kakao-map-${mode}`);
    expect(payload.data.path[0]).toEqual([35.8562, 129.2247]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/routing/${endpoint}`);
  });

  it('uses the first Kakao public transit route', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'rest-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'OK',
      routes: [{
        properties: { totalDistance: 920, totalTime: 600 },
        steps: [{ path: { points: [[129.2247, 35.8562], [129.226, 35.858]] } }]
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const response = await GET(request('public'));
    const payload = await response.json();

    expect(payload.data.source).toBe('kakao-map-public');
    expect(payload.data.durationSeconds).toBe(600);
    expect(payload.data.appUrl).toContain('by=publictransit');
    expect(payload.data.externalUrl).toContain('/link/by/traffic/');
  });

  it('keeps Kakao Mobility for car routes and caches successful responses', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'rest-key');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      routes: [{
        result_code: 0,
        summary: { distance: 510, duration: 120 },
        sections: [{ roads: [{ vertexes: [129.2247, 35.8562, 129.225, 35.857] }] }]
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await GET(request('car'));
    const second = await GET(request('car'));
    const firstPayload = await first.json();
    const secondPayload = await second.json();

    expect(firstPayload.data.source).toBe('kakao-mobility');
    expect(firstPayload.data.path[1]).toEqual([35.857, 129.225]);
    expect(secondPayload.meta.cacheHit).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('requests routes from Seoul to Gyeongju without a service area restriction', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'rest-key');
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ routes: [{ result_code: 0, summary: { distance: 330000, duration: 14400 } }] }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(request('car', { originLat: '37.5665', originLng: '126.978' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.source).toBe('kakao-mobility');
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('origin')).toContain('126.978,37.5665');
  });

  it('rejects missing coordinates', async () => {
    const response = await GET(new NextRequest('http://localhost/api/maps/directions?mode=walking'));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('INVALID_COORDINATES');
  });

  it('does not label missing car metrics as a real provider route', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'rest-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ routes: [{ result_code: 0, summary: {} }] })));
    const payload = await (await GET(request('car'))).json();
    expect(payload.meta.fallback).toBe(true);
    expect(payload.data.fallbackReason).toBe('provider-error');
    expect(payload.data.pathSource).toBe('straight-line');
  });

  it('selects the fastest valid transit option and preserves bus guidance and fare', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'rest-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'OK', routes: [
      { properties: { totalDistance: -1, totalTime: 1 } },
      { properties: { totalDistance: 2000, totalTime: 1800 } },
      { properties: { totalDistance: 1900, totalTime: 1200, type: 'BUS', transfers: 1, fare: { value: 1700 } },
        steps: [{ properties: { guidance: '10번 버스 · 첨성대 → 불국사', type: 'BUS', time: 1000 }, path: { points: [[129.22, 35.83], [129.33, 35.79]] } }] }
    ] })));
    const payload = await (await GET(request('public'))).json();
    expect(payload.data.distanceMeters).toBe(1900);
    expect(payload.data.durationSeconds).toBe(1200);
    expect(payload.data.summary).toEqual({ type: 'BUS', transfers: 1, fareWon: 1700 });
    expect(payload.data.steps[0].guidance).toContain('10번 버스');
  });

  it('isolates a failed mode in a comparison and does not retain coordinate responses in browser cache', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'rest-key');
    vi.stubGlobal('fetch', vi.fn(async input => String(input).includes('publictraffic')
      ? Response.json({ status: 'NO_RESULTS' })
      : String(input).includes('kakaomobility')
        ? Response.json({ routes: [{ result_code: 0, summary: { distance: 500, duration: 100 } }] })
        : Response.json({ status: 'OK', route: { properties: { totalDistance: 400, totalTime: 300 } } })));
    const response = await GET(request('walking', { mode: 'all' }));
    const payload = await response.json();
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(payload.meta.fallbackModes).toEqual(['public']);
    expect(payload.data.results).toHaveLength(4);
    expect(payload.data.results.find((item: { mode: string }) => item.mode === 'public').fallbackReason).toBe('no-route');
  });

  it('reuses concurrent route requests and refreshes names in external links', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'rest-key');
    const fetchMock = vi.fn(async () => Response.json({ status: 'OK', route: { properties: { totalDistance: 400, totalTime: 300 } } }));
    vi.stubGlobal('fetch', fetchMock);
    const responses = await Promise.all([
      GET(request('walking', { destinationName: '첫 이름' })),
      GET(request('walking', { destinationName: '새 이름' }))
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(decodeURIComponent((await responses[1].json()).data.externalUrl)).toContain('새 이름');
  });

  it('keeps the fallback flag on briefly cached failures', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'rest-key');
    const fetchMock = vi.fn(async () => new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    await GET(request('public'));
    const payload = await (await GET(request('public'))).json();
    expect(payload.meta).toMatchObject({ cacheHit: true, fallback: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported modes before making any provider request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request('car', { mode: 'flight' }));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

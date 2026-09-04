import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, type DirectionMode } from '@/app/api/maps/directions/route';

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

  it('rejects routes outside the Gyeongju service area before calling Kakao', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'rest-key');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(request('car', { originLat: '37.5665', originLng: '126.978' }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('OUTSIDE_GYEONGJU');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects missing coordinates', async () => {
    const response = await GET(new NextRequest('http://localhost/api/maps/directions?mode=walking'));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('INVALID_COORDINATES');
  });
});

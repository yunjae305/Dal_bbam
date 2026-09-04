import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GYEONGJU_SERVICE_BOUNDS,
  TimedCache,
  checkMapApiRateLimit,
  configuredFrontendOrigin,
  configuredKakaoMapOrigins,
  intersectGyeongjuBounds,
  isInGyeongjuServiceArea
} from '@/backend/kakao-map';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('Kakao map service guardrails', () => {
  it('accepts Gyeongju points and clips map searches to the service area', () => {
    expect(isInGyeongjuServiceArea({ lat: 35.8562, lng: 129.2247 })).toBe(true);
    expect(isInGyeongjuServiceArea({ lat: 37.5665, lng: 126.978 })).toBe(false);

    expect(intersectGyeongjuBounds({
      south: 35.8,
      west: 129.1,
      north: 36.5,
      east: 130
    })).toEqual({
      south: 35.8,
      west: 129.1,
      north: GYEONGJU_SERVICE_BOUNDS.north,
      east: GYEONGJU_SERVICE_BOUNDS.east
    });
    expect(intersectGyeongjuBounds({
      south: 37.4,
      west: 126.7,
      north: 37.8,
      east: 127.2
    })).toBeNull();
  });

  it('expires cached provider responses and evicts the oldest entry at capacity', () => {
    vi.useFakeTimers();
    const cache = new TimedCache<string>(1_000, 2);
    cache.set('first', 'one');
    cache.set('second', 'two');
    cache.set('third', 'three');

    expect(cache.get('first')).toBeNull();
    expect(cache.get('second')).toBe('two');
    vi.advanceTimersByTime(1_001);
    expect(cache.get('second')).toBeNull();
  });

  it('limits repeated map API requests per client and scope', () => {
    vi.stubEnv('MAP_API_RATE_LIMIT_DISABLED', 'false');
    const request = new NextRequest('http://localhost/api/maps/places', {
      headers: { 'x-forwarded-for': '203.0.113.87, 10.0.0.1' }
    });
    const scope = `test-${crypto.randomUUID()}`;

    expect(checkMapApiRateLimit(request, scope, 1)).toBe(true);
    expect(checkMapApiRateLimit(request, scope, 1)).toBe(false);
  });

  it('normalizes configured origins without exposing or accepting invalid URLs', () => {
    vi.stubEnv(
      'KAKAO_MAP_JS_ALLOWED_ORIGINS',
      'https://dalbbam.example/path, invalid, http://localhost:3000/'
    );
    vi.stubEnv('FRONTEND_URL', 'https://dalbbam.example/app');

    expect(configuredKakaoMapOrigins()).toEqual([
      'https://dalbbam.example',
      'http://localhost:3000'
    ]);
    expect(configuredFrontendOrigin()).toBe('https://dalbbam.example');
  });
});

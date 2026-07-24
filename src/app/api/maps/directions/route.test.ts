import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/maps/directions/route';

afterEach(() => vi.unstubAllEnvs());

function request(mode: 'car' | 'walking') {
  return new NextRequest(`http://localhost/api/maps/directions?originLat=35.8562&originLng=129.2247&destinationLat=35.857548&destinationLng=129.2247&mode=${mode}`);
}

describe('directions fallback', () => {
  it('labels walking distance as an estimate', async () => {
    const response = await GET(request('walking'));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data.source).toBe('straight-line-estimate');
    expect(payload.data.distanceMeters).toBeGreaterThan(149);
  });

  it('returns a deterministic car fallback when Kakao is not configured', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', '');
    const response = await GET(request('car'));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.meta.fallback).toBe(true);
    expect(payload.data.source).toBe('straight-line-fallback');
  });
});

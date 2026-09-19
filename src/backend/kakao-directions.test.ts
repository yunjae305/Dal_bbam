import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveDirections } from './kakao-directions';

const endpoints = {
  origin: { lat: 35.8562, lng: 129.2247 },
  destination: { lat: 35.8347, lng: 129.2191 },
  originName: '현재 위치',
  destinationName: '첨성대'
};

function mobilityRoute() {
  return Response.json({
    routes: [{
      result_code: 0,
      summary: { distance: 2400, duration: 420, fare: { toll: 0 } },
      sections: [{
        roads: [{ vertexes: [129.2247, 35.8562, 129.2191, 35.8347] }],
        guides: [
          { name: '출발지', guidance: '출발지', distance: 0, duration: 0, x: 129.2247, y: 35.8562 },
          { name: '태종로', guidance: '우회전', distance: 800, duration: 120, x: 129.2220, y: 35.8450 }
        ]
      }]
    }]
  });
}

describe('Kakao Mobility car directions', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('keeps each turn once and carries where it happens', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mobilityRoute()));

    const { result } = await resolveDirections('car', { ...endpoints, destinationName: `첨성대-${Date.now()}` }, 2000);

    expect(result.source).toBe('kakao-mobility');
    // "출발지 · 출발지" used to reach the traveler: the same word must not repeat.
    expect(result.steps?.[0]).toMatchObject({ guidance: '출발지', coordinates: [35.8562, 129.2247] });
    expect(result.steps?.[1]).toMatchObject({ guidance: '태종로 · 우회전', coordinates: [35.845, 129.222] });
  });
});

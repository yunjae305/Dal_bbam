import { NextRequest } from 'next/server';
import { apiData, apiError } from '@/backend/http';
import { distanceMeters, isValidCoordinate } from '@/backend/geo';

type KakaoDirections = {
  routes?: Array<{
    result_code?: number;
    summary?: { distance?: number; duration?: number };
    sections?: Array<{
      roads?: Array<{ vertexes?: number[] }>;
    }>;
  }>;
};

function coordinate(request: NextRequest, key: string): number {
  return Number(request.nextUrl.searchParams.get(key));
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const originLat = coordinate(request, 'originLat');
  const originLng = coordinate(request, 'originLng');
  const destinationLat = coordinate(request, 'destinationLat');
  const destinationLng = coordinate(request, 'destinationLng');
  const mode = request.nextUrl.searchParams.get('mode') === 'walking' ? 'walking' : 'car';
  const destinationName = request.nextUrl.searchParams.get('destinationName')?.slice(0, 100) || '목적지';

  if (!isValidCoordinate(originLat, originLng) || !isValidCoordinate(destinationLat, destinationLng)) {
    return apiError('INVALID_COORDINATES', '유효한 출발지와 목적지 좌표가 필요합니다.');
  }

  const straightDistance = Math.round(distanceMeters(
    { lat: originLat, lng: originLng },
    { lat: destinationLat, lng: destinationLng }
  ));
  const externalUrl = `https://map.kakao.com/link/to/${encodeURIComponent(destinationName)},${destinationLat},${destinationLng}`;

  if (mode === 'walking') {
    return apiData({
      mode,
      distanceMeters: straightDistance,
      durationSeconds: Math.round(straightDistance / 1.25),
      path: [[originLat, originLng], [destinationLat, destinationLng]],
      externalUrl,
      source: 'straight-line-estimate',
      disclaimer: '도보 시간은 직선거리 기반 예상치이며 실제 길안내는 카카오맵에서 확인하세요.'
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const apiKey = process.env.KAKAO_REST_API_KEY?.trim();
  if (apiKey) {
    const url = new URL('https://apis-navi.kakaomobility.com/v1/directions');
    url.searchParams.set('origin', `${originLng},${originLat}`);
    url.searchParams.set('destination', `${destinationLng},${destinationLat}`);
    url.searchParams.set('priority', 'RECOMMEND');

    try {
      const response = await fetch(url, {
        headers: { Authorization: `KakaoAK ${apiKey}` },
        signal: AbortSignal.timeout(4500),
        cache: 'no-store'
      });
      if (response.ok) {
        const payload = await response.json() as KakaoDirections;
        const route = payload.routes?.find(item => item.result_code === 0) ?? payload.routes?.[0];
        if (route?.summary) {
          const path = (route.sections ?? []).flatMap(section =>
            (section.roads ?? []).flatMap(road => {
              const vertices = road.vertexes ?? [];
              const pairs: [number, number][] = [];
              for (let index = 0; index < vertices.length; index += 2) {
                pairs.push([vertices[index + 1], vertices[index]]);
              }
              return pairs;
            })
          );

          console.info(JSON.stringify({
            event: 'provider_request',
            provider: 'kakao-mobility',
            operation: 'directions',
            cacheHit: false,
            fallback: false,
            durationMs: Date.now() - startedAt
          }));
          return apiData({
            mode,
            distanceMeters: route.summary.distance ?? straightDistance,
            durationSeconds: route.summary.duration ?? Math.round(straightDistance / 8.3),
            path,
            externalUrl,
            source: 'kakao-mobility'
          }, { headers: { 'Cache-Control': 'private, no-store' } });
        }
      }
    } catch {
      // Deterministic fallback below.
    }
  }

  console.info(JSON.stringify({
    event: 'provider_request',
    provider: 'kakao-mobility',
    operation: 'directions',
    cacheHit: false,
    fallback: true,
    durationMs: Date.now() - startedAt
  }));
  return apiData({
    mode,
    distanceMeters: straightDistance,
    durationSeconds: Math.round(straightDistance / 8.3),
    path: [[originLat, originLng], [destinationLat, destinationLng]],
    externalUrl,
    source: 'straight-line-fallback',
    disclaimer: '길찾기 공급자에 연결할 수 없어 직선거리 예상치를 표시합니다.'
  }, {
    meta: { fallback: true },
    headers: { 'Cache-Control': 'private, no-store' }
  });
}

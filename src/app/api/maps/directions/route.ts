import { NextRequest } from 'next/server';
import { apiData, apiError } from '@/backend/http';
import { distanceMeters, isValidCoordinate } from '@/backend/geo';
import { checkMapApiRateLimit, isInGyeongjuServiceArea } from '@/backend/kakao-map';
import { resolveDirections, type RouteEndpoints } from '@/backend/kakao-directions';
import { directionModes, type DirectionMode } from '@/shared/directions';
export type { DirectionMode, DirectionResult, DirectionStep } from '@/shared/directions';

const responseCacheControl = 'private, no-store';

function coordinate(request: NextRequest, key: string): number {
  const value = request.nextUrl.searchParams.get(key)?.trim();
  return value ? Number(value) : Number.NaN;
}

function directionMode(request: NextRequest): DirectionMode | 'all' {
  const requested = request.nextUrl.searchParams.get('mode');
  if (requested === 'all') return 'all';
  return requested === 'walking' || requested === 'public' || requested === 'bicycle'
    ? requested
    : 'car';
}

function endpointName(request: NextRequest, key: string, fallback: string): string {
  return request.nextUrl.searchParams.get(key)?.trim().slice(0, 100) || fallback;
}

export async function GET(request: NextRequest) {
  const origin = {
    lat: coordinate(request, 'originLat'),
    lng: coordinate(request, 'originLng')
  };
  const destination = {
    lat: coordinate(request, 'destinationLat'),
    lng: coordinate(request, 'destinationLng')
  };
  const mode = directionMode(request);
  const requestedMode = request.nextUrl.searchParams.get('mode');
  if (requestedMode && requestedMode !== 'all' && !directionModes.includes(requestedMode as DirectionMode)) {
    return apiError('INVALID_MODE', '지원하지 않는 이동수단입니다.');
  }
  const endpoints: RouteEndpoints = {
    origin,
    destination,
    originName: endpointName(request, 'originName', '현재 위치'),
    destinationName: endpointName(request, 'destinationName', '목적지')
  };

  if (!isValidCoordinate(origin.lat, origin.lng) || !isValidCoordinate(destination.lat, destination.lng)) {
    return apiError('INVALID_COORDINATES', '유효한 출발지와 목적지 좌표가 필요합니다.');
  }
  if (!isInGyeongjuServiceArea(origin) || !isInGyeongjuServiceArea(destination)) {
    return apiError('OUTSIDE_GYEONGJU', '경주 서비스 권역 안의 출발지와 목적지만 지원합니다.');
  }
  if (!checkMapApiRateLimit(request, 'kakao-directions', 30)) {
    return apiError('RATE_LIMITED', '길찾기 요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429);
  }

  const straightDistance = Math.round(distanceMeters(origin, destination));

  if (mode === 'all') {
    const resolved = await Promise.all(
      directionModes.map(item => resolveDirections(item, endpoints, straightDistance))
    );
    const fallbackModes = resolved.filter(item => item.fallback).map(item => item.result.mode);
    return apiData({
      origin: { ...origin, name: endpoints.originName },
      destination: { ...destination, name: endpoints.destinationName },
      straightDistanceMeters: straightDistance,
      results: resolved.map(item => item.result)
    }, {
      meta: {
        cacheHit: resolved.every(item => item.cacheHit),
        fallback: fallbackModes.length > 0,
        fallbackModes
      },
      headers: { 'Cache-Control': responseCacheControl }
    });
  }

  const { result, cacheHit, fallback } = await resolveDirections(mode, endpoints, straightDistance);
  return apiData(result, {
    meta: { cacheHit, fallback },
    headers: { 'Cache-Control': responseCacheControl }
  });
}

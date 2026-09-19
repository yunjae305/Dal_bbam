import {
  TimedCache
} from '@/backend/kakao-map';

import { validRouteMetric, type DirectionMode, type DirectionResult, type DirectionStep } from '@/shared/directions';
import { isValidCoordinate } from '@/backend/geo';

export type { DirectionMode, DirectionResult, DirectionStep };

type Point = { lat: number; lng: number };
export type RouteEndpoints = {
  origin: Point;
  destination: Point;
  originName: string;
  destinationName: string;
};

type KakaoMobilityGuide = {
  name?: string;
  guidance?: string;
  distance?: number;
  duration?: number;
  /** Kakao returns the turn position as x = longitude, y = latitude. */
  x?: number;
  y?: number;
};
type KakaoMobilityDirections = {
  routes?: Array<{
    result_code?: number;
    summary?: { distance?: number; duration?: number; fare?: { taxi?: number; toll?: number } };
    sections?: Array<{
      roads?: Array<{ vertexes?: number[] }>;
      guides?: KakaoMobilityGuide[];
    }>;
  }>;
};

type KakaoMapPath = { points?: number[][] };
type KakaoMapStep = {
  path?: KakaoMapPath;
  properties?: {
    guidance?: string;
    type?: string;
    distance?: number;
    time?: number;
  };
};
type KakaoMapLeg = { steps?: KakaoMapStep[] };
type KakaoMapRoute = {
  properties?: {
    totalDistance?: number;
    totalTime?: number;
    landingUrl?: string;
    landingURL?: string;
    type?: string;
    transfers?: number;
    fare?: { value?: number };
  };
  legs?: KakaoMapLeg[];
  steps?: KakaoMapStep[];
};
type KakaoMapDirections = {
  status?: string;
  route?: KakaoMapRoute;
  routes?: KakaoMapRoute[];
};

const MAX_STEPS = 40;
const directionsCache = new TimedCache<DirectionResult>(5 * 60_000, 300);
const failedDirectionsCache = new TimedCache<DirectionResult>(15_000, 100);
const pendingDirections = new Map<string, Promise<DirectionResult>>();
function requestTimeoutMs(): number {
  const configured = Number(process.env.KAKAO_MAP_REQUEST_TIMEOUT_MS);
  return Number.isFinite(configured)
    ? Math.min(10_000, Math.max(1_000, configured))
    : 4_500;
}

function finiteOrUndefined(value: number | undefined): number | undefined {
  return validRouteMetric(value) ? value : undefined;
}

function routeLinks(mode: DirectionMode, endpoints: RouteEndpoints) {
  const webMode: Record<DirectionMode, string> = {
    car: 'car',
    walking: 'walk',
    public: 'traffic',
    bicycle: 'bicycle'
  };
  const appMode: Record<DirectionMode, string> = {
    car: 'car',
    walking: 'foot',
    public: 'publictransit',
    bicycle: 'bicycle'
  };
  const { origin, destination } = endpoints;
  const originPart = `${encodeURIComponent(endpoints.originName)},${origin.lat},${origin.lng}`;
  const destinationPart = `${encodeURIComponent(endpoints.destinationName)},${destination.lat},${destination.lng}`;
  const webFallbackUrl = `https://map.kakao.com/link/by/${webMode[mode]}/${originPart}/${destinationPart}`;
  const appUrl = `kakaomap://route?sp=${origin.lat},${origin.lng}&ep=${destination.lat},${destination.lng}&by=${appMode[mode]}`;

  return { externalUrl: webFallbackUrl, webFallbackUrl, appUrl };
}

function mapPath(points: number[][]): [number, number][] {
  return points.flatMap(point => {
    if (!Array.isArray(point)) return [];
    const [lng, lat] = point;
    return isValidCoordinate(lat, lng) ? [[lat, lng] as [number, number]] : [];
  });
}

function kakaoMapRouteSteps(route: KakaoMapRoute): KakaoMapStep[] {
  return route.legs?.flatMap(leg => leg.steps ?? []) ?? route.steps ?? [];
}

function kakaoMapRoutePath(route: KakaoMapRoute): [number, number][] {
  return kakaoMapRouteSteps(route).flatMap(step => mapPath(step.path?.points ?? []));
}

function kakaoMapGuidance(route: KakaoMapRoute): DirectionStep[] {
  return kakaoMapRouteSteps(route)
    .flatMap(step => {
      const guidance = step.properties?.guidance?.trim();
      if (!guidance) return [];
      const item: DirectionStep = {
        guidance,
        type: step.properties?.type,
        distanceMeters: finiteOrUndefined(step.properties?.distance),
        durationSeconds: finiteOrUndefined(step.properties?.time)
      };
      return [item];
    })
    .slice(0, MAX_STEPS);
}

function ensurePath(path: [number, number][], endpoints: RouteEndpoints): [number, number][] {
  const { origin, destination } = endpoints;
  return path.length ? path : [[origin.lat, origin.lng], [destination.lat, destination.lng]];
}

function cacheKey(mode: DirectionMode, endpoints: RouteEndpoints) {
  const { origin, destination } = endpoints;
  return [
    mode,
    origin.lat.toFixed(5),
    origin.lng.toFixed(5),
    destination.lat.toFixed(5),
    destination.lng.toFixed(5)
  ].join(':');
}

async function loadKakaoMapDirections(
  apiKey: string,
  mode: Exclude<DirectionMode, 'car'>,
  endpoints: RouteEndpoints
): Promise<DirectionResult | null> {
  const { origin, destination } = endpoints;
  const endpoint = mode === 'walking' ? 'walk' : mode === 'public' ? 'publictraffic' : 'bicycle';
  const url = new URL(`https://dapi.kakao.com/v2/routing/${endpoint}`);
  url.searchParams.set('start_x', String(origin.lng));
  url.searchParams.set('start_y', String(origin.lat));
  url.searchParams.set('end_x', String(destination.lng));
  url.searchParams.set('end_y', String(destination.lat));
  url.searchParams.set('s_name', endpoints.originName);
  url.searchParams.set('e_name', endpoints.destinationName);

  const response = await fetch(url, {
    headers: { Authorization: `KakaoAK ${apiKey}` },
    signal: AbortSignal.timeout(requestTimeoutMs()),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error('Route provider unavailable');

  const payload = await response.json() as KakaoMapDirections;
  if (['NO_RESULTS', 'STARTNODES_NULL', 'ENDNODES_NULL', 'EQUAL_POINTS', 'SAME_POINT', 'START_LINK_NOT_FOUND', 'END_LINK_NOT_FOUND', 'TOO_FAR_AWAY', 'ROUTE_RESULT_NOT_FOUND'].includes(payload.status ?? '')) return null;
  if (payload.status !== 'OK') throw new Error('Invalid route response');
  // The first transit option is not guaranteed to be the fastest usable route.
  const route = mode === 'public' ? payload.routes
    ?.filter(item => validRouteMetric(item.properties?.totalDistance) && validRouteMetric(item.properties?.totalTime))
    .sort((a, b) => a.properties!.totalTime! - b.properties!.totalTime!)[0] : payload.route;
  const properties = route?.properties;
  if (!route || !properties || !validRouteMetric(properties.totalDistance) || !validRouteMetric(properties.totalTime)) {
    throw new Error('Invalid route metrics');
  }

  const summary = mode === 'public'
    ? {
      type: properties.type,
      transfers: finiteOrUndefined(properties.transfers),
      fareWon: finiteOrUndefined(properties.fare?.value)
    }
    : undefined;

  const path = kakaoMapRoutePath(route);
  return {
    mode,
    distanceMeters: properties.totalDistance!,
    durationSeconds: properties.totalTime!,
    path: ensurePath(path, endpoints),
    pathSource: path.length >= 2 ? 'provider' : 'straight-line',
    ...routeLinks(mode, endpoints),
    source: `kakao-map-${mode}`,
    summary,
    steps: kakaoMapGuidance(route)
  };
}

async function loadKakaoCarDirections(
  apiKey: string,
  endpoints: RouteEndpoints
): Promise<DirectionResult | null> {
  const { origin, destination } = endpoints;
  const url = new URL('https://apis-navi.kakaomobility.com/v1/directions');
  url.searchParams.set('origin', `${origin.lng},${origin.lat}`);
  url.searchParams.set('destination', `${destination.lng},${destination.lat}`);
  url.searchParams.set('priority', 'RECOMMEND');

  const response = await fetch(url, {
    headers: { Authorization: `KakaoAK ${apiKey}` },
    signal: AbortSignal.timeout(requestTimeoutMs()),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error('Route provider unavailable');

  const payload = await response.json() as KakaoMobilityDirections;
  const route = payload.routes?.find(item => item.result_code === 0);
  if (!route) return null;
  if (!validRouteMetric(route.summary?.distance) || !validRouteMetric(route.summary?.duration)) throw new Error('Invalid route metrics');
  const sections = route.sections ?? [];
  const path = sections.flatMap(section =>
    (section.roads ?? []).flatMap(road => {
      const vertices = road.vertexes ?? [];
      const pairs: [number, number][] = [];
      for (let index = 0; index + 1 < vertices.length; index += 2) {
        const lng = vertices[index];
        const lat = vertices[index + 1];
        if (isValidCoordinate(lat, lng)) pairs.push([lat, lng]);
      }
      return pairs;
    })
  );
  const steps = sections
    .flatMap(section => section.guides ?? [])
    .flatMap(guide => {
      // Kakao repeats the same word in both fields at the endpoints ("출발지 · 출발지").
      const guidance = [...new Set([guide.name, guide.guidance]
        .map(value => value?.trim())
        .filter(Boolean))]
        .join(' · ');
      if (!guidance) return [];
      const lat = finiteOrUndefined(guide.y);
      const lng = finiteOrUndefined(guide.x);
      const item: DirectionStep = {
        guidance,
        type: 'CAR',
        distanceMeters: finiteOrUndefined(guide.distance),
        durationSeconds: finiteOrUndefined(guide.duration),
        ...(lat !== undefined && lng !== undefined ? { coordinates: [lat, lng] as [number, number] } : {})
      };
      return [item];
    })
    .slice(0, MAX_STEPS);
  const toll = finiteOrUndefined(route.summary.fare?.toll);

  return {
    mode: 'car',
    distanceMeters: route.summary!.distance!,
    durationSeconds: route.summary!.duration!,
    path: ensurePath(path, endpoints),
    pathSource: path.length >= 2 ? 'provider' : 'straight-line',
    ...routeLinks('car', endpoints),
    source: 'kakao-mobility',
    summary: toll !== undefined && toll > 0 ? { fareWon: toll } : undefined,
    steps
  };
}

function fallbackResult(
  mode: DirectionMode,
  endpoints: RouteEndpoints,
  straightDistance: number,
  fallbackReason: DirectionResult['fallbackReason']
): DirectionResult {
  const { origin, destination } = endpoints;
  const metersPerSecond: Record<DirectionMode, number> = {
    car: 8.3,
    walking: 1.25,
    public: 5.5,
    bicycle: 4.2
  };
  const walkingWithoutKey = mode === 'walking' && !process.env.KAKAO_REST_API_KEY?.trim();

  return {
    mode,
    distanceMeters: straightDistance,
    durationSeconds: Math.round(straightDistance / metersPerSecond[mode]),
    path: [[origin.lat, origin.lng], [destination.lat, destination.lng]],
    pathSource: 'straight-line',
    fallbackReason,
    ...routeLinks(mode, endpoints),
    source: walkingWithoutKey ? 'straight-line-estimate' : 'straight-line-fallback',
    disclaimer: '실제 이동 경로를 확인하지 못했습니다. 표시된 거리는 직선거리이며 소요 시간·운행 여부는 카카오맵에서 확인해 주세요.'
  };
}

export async function resolveDirections(
  mode: DirectionMode,
  endpoints: RouteEndpoints,
  straightDistance: number
): Promise<{ result: DirectionResult; cacheHit: boolean; fallback: boolean }> {
  const startedAt = Date.now();
  const key = cacheKey(mode, endpoints);
  const cached = directionsCache.get(key) ?? failedDirectionsCache.get(key);
  if (cached) return { result: { ...cached, ...routeLinks(mode, endpoints) }, cacheHit: true, fallback: Boolean(cached.fallbackReason) };

  const pending = pendingDirections.get(key);
  if (pending) {
    const result = await pending;
    return { result: { ...result, ...routeLinks(mode, endpoints) }, cacheHit: true, fallback: Boolean(result.fallbackReason) };
  }

  const task = (async () => {
    const apiKey = process.env.KAKAO_REST_API_KEY?.trim();
    let result: DirectionResult | null = null;
    let fallbackReason: DirectionResult['fallbackReason'] = 'not-configured';
    const provider = mode === 'car' ? 'kakao-mobility' : 'kakao-map';

    if (apiKey) {
      try {
        fallbackReason = 'no-route';
        result = mode === 'car'
          ? await loadKakaoCarDirections(apiKey, endpoints)
          : await loadKakaoMapDirections(apiKey, mode, endpoints);
      } catch {
        result = null;
        fallbackReason = 'provider-error';
      }
    }

    if (result) directionsCache.set(key, result);
    else failedDirectionsCache.set(key, fallbackResult(mode, endpoints, straightDistance, fallbackReason));
    const fallback = !result;

    console.info(JSON.stringify({
      event: 'provider_request',
      provider,
      operation: `directions:${mode}`,
      cacheHit: false,
      fallback,
      durationMs: Date.now() - startedAt
    }));

    return result ?? fallbackResult(mode, endpoints, straightDistance, fallbackReason);
  })();
  pendingDirections.set(key, task);
  try {
    const result = await task;
    return { result, cacheHit: false, fallback: Boolean(result.fallbackReason) };
  } finally {
    pendingDirections.delete(key);
  }
}


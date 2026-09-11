import {
  TimedCache
} from '@/backend/kakao-map';

import { type DirectionMode, type DirectionResult, type DirectionStep } from '@/shared/directions';

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
function requestTimeoutMs(): number {
  const configured = Number(process.env.KAKAO_MAP_REQUEST_TIMEOUT_MS);
  return Number.isFinite(configured)
    ? Math.min(10_000, Math.max(1_000, configured))
    : 4_500;
}

function finiteOrUndefined(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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
    const [lng, lat] = point;
    return Number.isFinite(lat) && Number.isFinite(lng) ? [[lat, lng] as [number, number]] : [];
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
    destination.lng.toFixed(5),
    endpoints.originName,
    endpoints.destinationName
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
  if (!response.ok) return null;

  const payload = await response.json() as KakaoMapDirections;
  if (payload.status !== 'OK') return null;
  const route = mode === 'public' ? payload.routes?.[0] : payload.route;
  const properties = route?.properties;
  if (!route || !properties || !Number.isFinite(properties.totalDistance) || !Number.isFinite(properties.totalTime)) {
    return null;
  }

  const summary = mode === 'public'
    ? {
      type: properties.type,
      transfers: finiteOrUndefined(properties.transfers),
      fareWon: finiteOrUndefined(properties.fare?.value)
    }
    : undefined;

  return {
    mode,
    distanceMeters: properties.totalDistance!,
    durationSeconds: properties.totalTime!,
    path: ensurePath(kakaoMapRoutePath(route), endpoints),
    ...routeLinks(mode, endpoints),
    source: `kakao-map-${mode}`,
    summary,
    steps: kakaoMapGuidance(route)
  };
}

async function loadKakaoCarDirections(
  apiKey: string,
  endpoints: RouteEndpoints,
  straightDistance: number
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
  if (!response.ok) return null;

  const payload = await response.json() as KakaoMobilityDirections;
  const route = payload.routes?.find(item => item.result_code === 0);
  if (!route?.summary) return null;
  const sections = route.sections ?? [];
  const path = sections.flatMap(section =>
    (section.roads ?? []).flatMap(road => {
      const vertices = road.vertexes ?? [];
      const pairs: [number, number][] = [];
      for (let index = 0; index + 1 < vertices.length; index += 2) {
        const lng = vertices[index];
        const lat = vertices[index + 1];
        if (Number.isFinite(lat) && Number.isFinite(lng)) pairs.push([lat, lng]);
      }
      return pairs;
    })
  );
  const steps = sections
    .flatMap(section => section.guides ?? [])
    .flatMap(guide => {
      const guidance = [guide.name, guide.guidance]
        .map(value => value?.trim())
        .filter(Boolean)
        .join(' · ');
      if (!guidance) return [];
      const item: DirectionStep = {
        guidance,
        type: 'CAR',
        distanceMeters: finiteOrUndefined(guide.distance),
        durationSeconds: finiteOrUndefined(guide.duration)
      };
      return [item];
    })
    .slice(0, MAX_STEPS);
  const toll = finiteOrUndefined(route.summary.fare?.toll);

  return {
    mode: 'car',
    distanceMeters: route.summary.distance ?? straightDistance,
    durationSeconds: route.summary.duration ?? Math.round(straightDistance / 8.3),
    path: ensurePath(path, endpoints),
    ...routeLinks('car', endpoints),
    source: 'kakao-mobility',
    summary: toll !== undefined && toll > 0 ? { fareWon: toll } : undefined,
    steps
  };
}

function fallbackResult(
  mode: DirectionMode,
  endpoints: RouteEndpoints,
  straightDistance: number
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
    ...routeLinks(mode, endpoints),
    source: walkingWithoutKey ? 'straight-line-estimate' : 'straight-line-fallback',
    disclaimer: `${mode === 'walking' ? '도보' : mode === 'public' ? '대중교통' : mode === 'bicycle' ? '자전거' : '자동차'} 경로 공급자에 연결할 수 없어 직선거리 예상치를 표시합니다.`
  };
}

export async function resolveDirections(
  mode: DirectionMode,
  endpoints: RouteEndpoints,
  straightDistance: number
): Promise<{ result: DirectionResult; cacheHit: boolean; fallback: boolean }> {
  const startedAt = Date.now();
  const key = cacheKey(mode, endpoints);
  const cached = directionsCache.get(key);
  if (cached) return { result: cached, cacheHit: true, fallback: false };

  const apiKey = process.env.KAKAO_REST_API_KEY?.trim();
  let result: DirectionResult | null = null;
  const provider = mode === 'car' ? 'kakao-mobility' : 'kakao-map';

  if (apiKey) {
    try {
      result = mode === 'car'
        ? await loadKakaoCarDirections(apiKey, endpoints, straightDistance)
        : await loadKakaoMapDirections(apiKey, mode, endpoints);
    } catch {
      result = null;
    }
  }

  if (result) directionsCache.set(key, result);
  const fallback = !result;

  console.info(JSON.stringify({
    event: 'provider_request',
    provider,
    operation: `directions:${mode}`,
    cacheHit: false,
    fallback,
    durationMs: Date.now() - startedAt
  }));

  return {
    result: result ?? fallbackResult(mode, endpoints, straightDistance),
    cacheHit: false,
    fallback
  };
}


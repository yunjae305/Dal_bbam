import { NextRequest } from 'next/server';
import { apiData, apiError } from '@/backend/http';
import {
  checkMapApiRateLimit,
  GYEONGJU_CENTER,
  type GeoBounds,
  TimedCache
} from '@/backend/kakao-map';
import { isValidCoordinate } from '@/backend/geo';

const categoryGroups = new Set([
  'MT1', 'CS2', 'PS3', 'SC4', 'AC5', 'PK6', 'OL7', 'SW8', 'BK9',
  'CT1', 'AG2', 'PO3', 'AT4', 'AD5', 'FD6', 'CE7', 'HP8', 'PM9'
]);

type KakaoPlaceDocument = {
  id?: string;
  place_name?: string;
  category_name?: string;
  category_group_code?: string;
  category_group_name?: string;
  phone?: string;
  address_name?: string;
  road_address_name?: string;
  x?: string;
  y?: string;
  place_url?: string;
  distance?: string;
};

type KakaoPlaceResponse = {
  meta?: {
    total_count?: number;
    pageable_count?: number;
    is_end?: boolean;
  };
  documents?: KakaoPlaceDocument[];
};

export type KakaoPlace = {
  id: string;
  name: string;
  categoryName: string;
  categoryGroupCode: string;
  categoryGroupName: string;
  phone: string;
  address: string;
  roadAddress: string;
  lat: number;
  lng: number;
  placeUrl: string;
  distanceMeters: number | null;
};

type PlacesResult = {
  places: KakaoPlace[];
  meta: { totalCount: number; pageableCount: number; isEnd: boolean };
  query: string | null;
  category: string | null;
};

const placesCache = new TimedCache<PlacesResult>(5 * 60_000, 300);
const cacheControl = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';

function timeoutMs(): number {
  const configured = Number(process.env.KAKAO_MAP_REQUEST_TIMEOUT_MS);
  return Number.isFinite(configured)
    ? Math.min(10_000, Math.max(1_000, configured))
    : 4_500;
}

function numericParam(request: NextRequest, name: string): number | null {
  const raw = request.nextUrl.searchParams.get(name)?.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
}

function requestedBounds(request: NextRequest): { bounds?: GeoBounds; invalid?: boolean } {
  const values = {
    south: numericParam(request, 'south'),
    west: numericParam(request, 'west'),
    north: numericParam(request, 'north'),
    east: numericParam(request, 'east')
  };
  const supplied = Object.values(values).filter(value => value !== null).length;
  if (supplied === 0) return {};
  if (supplied !== 4 || Object.values(values).some(value => !Number.isFinite(value))) {
    return { invalid: true };
  }

  const bounds = values as GeoBounds;
  if (bounds.south >= bounds.north || bounds.west >= bounds.east) return { invalid: true };
  if (!isValidCoordinate(bounds.south, bounds.west) || !isValidCoordinate(bounds.north, bounds.east)) return { invalid: true };
  return { bounds };
}

function safePlaceUrl(value?: string): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.hostname !== 'place.map.kakao.com' && url.hostname !== 'map.kakao.com') return '';
    url.protocol = 'https:';
    return url.toString();
  } catch {
    return '';
  }
}

function mapPlace(document: KakaoPlaceDocument): KakaoPlace | null {
  const lat = Number(document.y);
  const lng = Number(document.x);
  if (!document.id || !document.place_name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!document.x?.trim() || !document.y?.trim() || !isValidCoordinate(lat, lng)) return null;
  const distance = document.distance ? Number(document.distance) : Number.NaN;

  return {
    id: document.id,
    name: document.place_name,
    categoryName: document.category_name ?? '',
    categoryGroupCode: document.category_group_code ?? '',
    categoryGroupName: document.category_group_name ?? '',
    phone: document.phone ?? '',
    address: document.address_name ?? '',
    roadAddress: document.road_address_name ?? '',
    lat,
    lng,
    placeUrl: safePlaceUrl(document.place_url),
    distanceMeters: Number.isFinite(distance) ? distance : null
  };
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query')?.trim() || null;
  const category = request.nextUrl.searchParams.get('category')?.trim().toUpperCase() || null;
  if (!query && !category) {
    return apiError('SEARCH_REQUIRED', '검색어 또는 카카오 장소 카테고리가 필요합니다.');
  }
  if (query && query.length > 60) {
    return apiError('INVALID_QUERY', '검색어는 60자 이하여야 합니다.');
  }
  if (category && !categoryGroups.has(category)) {
    return apiError('INVALID_CATEGORY', '지원하지 않는 카카오 장소 카테고리입니다.');
  }

  const parsedBounds = requestedBounds(request);
  if (parsedBounds.invalid) {
    return apiError('INVALID_BOUNDS', '유효한 지도 영역 좌표가 필요합니다.');
  }
  if (!checkMapApiRateLimit(request, 'kakao-places', 45)) {
    return apiError('RATE_LIMITED', '장소 검색 요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429);
  }

  const page = Math.min(45, Math.max(1, Number(request.nextUrl.searchParams.get('page')) || 1));
  const size = Math.min(15, Math.max(1, Number(request.nextUrl.searchParams.get('size')) || 15));
  const bounds = parsedBounds.bounds;
  const key = JSON.stringify({ query, category, bounds, page, size });
  const cached = placesCache.get(key);
  if (cached) {
    return apiData(cached, { meta: { cacheHit: true }, headers: { 'Cache-Control': cacheControl } });
  }

  const apiKey = process.env.KAKAO_REST_API_KEY?.trim();
  if (!apiKey) {
    return apiError('KAKAO_NOT_CONFIGURED', '카카오맵 REST API가 설정되지 않았습니다.', 503);
  }

  const endpoint = query ? 'keyword' : 'category';
  const url = new URL(`https://dapi.kakao.com/v2/local/search/${endpoint}.json`);
  if (query) url.searchParams.set('query', query);
  if (category) url.searchParams.set('category_group_code', category);
  if (bounds) {
    url.searchParams.set('rect', `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`);
  } else if (!query) {
    url.searchParams.set('x', String(GYEONGJU_CENTER.lng));
    url.searchParams.set('y', String(GYEONGJU_CENTER.lat));
    url.searchParams.set('radius', '20000');
  }
  url.searchParams.set('page', String(page));
  url.searchParams.set('size', String(size));
  url.searchParams.set('sort', bounds || query ? 'accuracy' : 'distance');

  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      headers: { Authorization: `KakaoAK ${apiKey}` },
      signal: AbortSignal.timeout(timeoutMs()),
      cache: 'no-store'
    });
    if (!response.ok) {
      return apiError('KAKAO_PLACES_FAILED', '카카오 장소 검색을 완료하지 못했습니다.', 502);
    }

    const payload = await response.json() as KakaoPlaceResponse;
    const result: PlacesResult = {
      places: (payload.documents ?? []).flatMap(document => {
        const place = mapPlace(document);
        return place ? [place] : [];
      }),
      meta: {
        totalCount: payload.meta?.total_count ?? 0,
        pageableCount: payload.meta?.pageable_count ?? 0,
        isEnd: payload.meta?.is_end ?? true
      },
      query,
      category
    };
    placesCache.set(key, result);
    console.info(JSON.stringify({
      event: 'provider_request',
      provider: 'kakao-map',
      operation: `places:${endpoint}`,
      cacheHit: false,
      fallback: false,
      durationMs: Date.now() - startedAt
    }));
    return apiData(result, { headers: { 'Cache-Control': cacheControl } });
  } catch {
    return apiError('KAKAO_PLACES_TIMEOUT', '카카오 장소 검색 응답이 지연되고 있습니다.', 504);
  }
}

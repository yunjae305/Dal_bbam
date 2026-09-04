const TOUR_API_BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';
const DEFAULT_MOBILE_OS = 'ETC';
const DEFAULT_MOBILE_APP = 'DalBbam';
const GYEONGJU_AREA_CODE = '35';
const GYEONGJU_SIGUNGU_CODE = '2';
const GYEONGJU_MAP_X = '129.2247';
const GYEONGJU_MAP_Y = '35.8562';
const DEFAULT_CONTENT_TYPE_ID = '12';
const DEFAULT_RADIUS = '2000';
const GYEONGJU_RADIUS = '30000';
const DEFAULT_CACHE_TTL_SECONDS = 60 * 30;
const DEFAULT_REQUEST_TIMEOUT_MS = 8000;
const MAX_NUM_OF_ROWS = 100;
const MAX_PAGE_NO = 1000;
const MAX_RADIUS_M = 20000;
const MAX_CACHE_ENTRIES = 500;
const ALLOWED_CONTENT_TYPE_IDS = new Set(['12', '14', '15', '25', '28', '32', '38', '39']);

function boundedEnvNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

const TOUR_API_CACHE_TTL_SECONDS = boundedEnvNumber(
  process.env.TOUR_API_CACHE_TTL_SECONDS,
  DEFAULT_CACHE_TTL_SECONDS,
  1,
  86400
);
const TOUR_API_CACHE_TTL_MS = TOUR_API_CACHE_TTL_SECONDS * 1000;
const TOUR_API_REQUEST_TIMEOUT_MS = boundedEnvNumber(
  process.env.TOUR_API_REQUEST_TIMEOUT_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  1000,
  30000
);

export const TOUR_API_CACHE_CONTROL = `public, s-maxage=${Math.floor(TOUR_API_CACHE_TTL_SECONDS)}, stale-while-revalidate=86400`;

type TourApiResult<T> = {
  items: T[];
  pageNo: number;
  numOfRows: number;
  totalCount: number;
  cache: {
    hit: boolean;
    ttlSeconds: number;
    cachedAt: string;
  };
};

type CacheEntry<T> = {
  expiresAt: number;
  cachedAt: string;
  value: Omit<TourApiResult<T>, 'cache'>;
};

const tourApiCache = new Map<string, CacheEntry<unknown>>();
const pendingRequests = new Map<string, Promise<TourApiResult<unknown>>>();

type TourApiRequestOptions = {
  /** Skip the in-memory cache and the shared in-flight request (used by readiness probes). */
  bypassCache?: boolean;
};

type TourApiEnvelope<T> = {
  // data.go.kr wraps gateway-level failures (unregistered key, quota exceeded,
  // service not registered) in this envelope with HTTP 200.
  OpenAPI_ServiceResponse?: {
    cmmMsgHeader?: {
      errMsg?: string;
      returnAuthMsg?: string;
      returnReasonCode?: string;
    };
  };
  response?: {
    header?: {
      resultCode?: string;
      resultMsg?: string;
    };
    body?: {
      items?: {
        item?: T | T[];
      };
      numOfRows?: number;
      pageNo?: number;
      totalCount?: number;
    };
  };
};

export type TourPlaceSummary = Record<string, string | number | null | undefined>;
export type TourPlaceDetail = Record<string, string | number | null | undefined>;
export type TourAreaCode = Record<string, string | number | null | undefined>;
export type TourImage = Record<string, string | number | null | undefined>;

export class TourApiConfigError extends Error {
  constructor() {
    super('TOUR_API_KEY is not configured.');
    this.name = 'TourApiConfigError';
  }
}

export class TourApiError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'TourApiError';
    this.status = status;
  }
}

function positiveInteger(value: string | undefined, fallback: number, max: number, field: string): string {
  const parsed = value === undefined ? fallback : Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new TourApiError(`${field} must be an integer between 1 and ${max}.`, 400);
  }

  return String(parsed);
}

function contentTypeId(value: string | undefined, fallback = DEFAULT_CONTENT_TYPE_ID): string {
  const resolved = value ?? fallback;

  if (!ALLOWED_CONTENT_TYPE_IDS.has(resolved)) {
    throw new TourApiError('Unsupported contentTypeId.', 400);
  }

  return resolved;
}

function numericId(value: string, field: string): string {
  const trimmed = value.trim();

  if (!/^\d{1,30}$/.test(trimmed)) {
    throw new TourApiError(`${field} must contain only numbers.`, 400);
  }

  return trimmed;
}

function coordinate(value: string, field: 'mapX' | 'mapY'): string {
  const parsed = Number(value);
  const valid = Number.isFinite(parsed) && (field === 'mapX'
    ? parsed >= -180 && parsed <= 180
    : parsed >= -90 && parsed <= 90);

  if (!valid) {
    throw new TourApiError(`${field} is not a valid coordinate.`, 400);
  }

  // ~11 m precision: keeps the request/cache key stable while the user drifts.
  return String(Math.round(parsed * 10000) / 10000);
}

function yyyymmdd(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (!/^\d{8}$/.test(value)) {
    throw new TourApiError(`${field} must use YYYYMMDD format.`, 400);
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new TourApiError(`${field} is not a valid date.`, 400);
  }
  return value;
}

function getTourApiKey(): string {
  const apiKey = process.env.TOUR_API_KEY?.trim();

  if (!apiKey) {
    throw new TourApiConfigError();
  }

  return apiKey;
}

function encodeServiceKey(apiKey: string): string {
  return apiKey.includes('%') ? apiKey : encodeURIComponent(apiKey);
}

function buildTourApiUrl(path: string, params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams({
    MobileOS: DEFAULT_MOBILE_OS,
    MobileApp: DEFAULT_MOBILE_APP,
    _type: 'json'
  });

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      searchParams.set(key, String(value));
    }
  }

  return `${TOUR_API_BASE_URL}/${path}?serviceKey=${encodeServiceKey(getTourApiKey())}&${searchParams}`;
}

function buildCacheKey(path: string, params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`);

  return `${path}?${entries.join('&')}`;
}

function normalizeItems<T>(item: T | T[] | undefined): T[] {
  if (!item) {
    return [];
  }

  return Array.isArray(item) ? item : [item];
}

async function requestTourApi<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  options: TourApiRequestOptions = {}
): Promise<TourApiResult<T>> {
  const cacheKey = buildCacheKey(path, params);

  if (options.bypassCache) {
    return fetchAndCacheTourApi<T>(path, params, cacheKey);
  }

  const cached = tourApiCache.get(cacheKey) as CacheEntry<T> | undefined;

  if (cached && cached.expiresAt > Date.now()) {
    console.info(JSON.stringify({
      event: 'provider_request',
      provider: 'tour-api',
      operation: path,
      cacheHit: true,
      fallback: false,
      durationMs: 0
    }));
    return {
      ...cached.value,
      cache: {
        hit: true,
        ttlSeconds: Math.max(0, Math.floor((cached.expiresAt - Date.now()) / 1000)),
        cachedAt: cached.cachedAt
      }
    };
  }

  if (cached) {
    tourApiCache.delete(cacheKey);
  }

  const pending = pendingRequests.get(cacheKey) as Promise<TourApiResult<T>> | undefined;
  if (pending) {
    return pending;
  }

  const request = fetchAndCacheTourApi<T>(path, params, cacheKey);
  pendingRequests.set(cacheKey, request as Promise<TourApiResult<unknown>>);

  try {
    return await request;
  } finally {
    pendingRequests.delete(cacheKey);
  }
}

async function fetchAndCacheTourApi<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  cacheKey: string
): Promise<TourApiResult<T>> {
  let response: Response;
  const startedAt = Date.now();

  try {
    response = await fetch(buildTourApiUrl(path, params), {
      headers: {
        Accept: 'application/json'
      },
      cache: 'force-cache',
      next: {
        revalidate: TOUR_API_CACHE_TTL_SECONDS
      },
      signal: AbortSignal.timeout(TOUR_API_REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new TourApiError('TourAPI request timed out.', 504);
    }
    throw new TourApiError('TourAPI request failed.');
  }

  if (!response.ok) {
    throw new TourApiError(`TourAPI request failed with status ${response.status}.`, response.status);
  }

  let data: TourApiEnvelope<T>;

  try {
    data = await response.json() as TourApiEnvelope<T>;
  } catch {
    throw new TourApiError('TourAPI returned an invalid JSON response.');
  }

  if (!data.response) {
    // Gateway error envelope (or an unknown shape): never treat it as an empty
    // success, and never cache it.
    const gateway = data.OpenAPI_ServiceResponse?.cmmMsgHeader;
    const reason = [gateway?.errMsg, gateway?.returnAuthMsg, gateway?.returnReasonCode]
      .filter(Boolean)
      .join(' ');
    const rateLimited = /LIMITED_NUMBER_OF_SERVICE_REQUESTS/i.test(reason);
    throw new TourApiError(
      gateway?.errMsg?.trim() || 'TourAPI returned an unexpected response.',
      rateLimited ? 429 : 502
    );
  }

  const header = data.response.header;

  if (header?.resultCode && header.resultCode !== '0000') {
    throw new TourApiError(header.resultMsg ?? 'TourAPI returned an error.');
  }

  const body = data.response.body;
  const cachedAt = new Date().toISOString();
  const value = {
    items: normalizeItems(body?.items?.item),
    pageNo: body?.pageNo ?? Number(params.pageNo ?? 1),
    numOfRows: body?.numOfRows ?? Number(params.numOfRows ?? 20),
    totalCount: body?.totalCount ?? 0
  };

  if (tourApiCache.size >= MAX_CACHE_ENTRIES) {
    const now = Date.now();
    for (const [key, entry] of tourApiCache) {
      if (entry.expiresAt <= now) {
        tourApiCache.delete(key);
      }
    }

    while (tourApiCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = tourApiCache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      tourApiCache.delete(oldestKey);
    }
  }

  tourApiCache.set(cacheKey, {
    expiresAt: Date.now() + TOUR_API_CACHE_TTL_MS,
    cachedAt,
    value
  });

  console.info(JSON.stringify({
    event: 'provider_request',
    provider: 'tour-api',
    operation: path,
    cacheHit: false,
    fallback: false,
    durationMs: Date.now() - startedAt,
    itemCount: value.items.length
  }));

  return {
    ...value,
    cache: {
      hit: false,
      ttlSeconds: Math.max(1, Math.floor(TOUR_API_CACHE_TTL_MS / 1000)),
      cachedAt
    }
  };
}

function getTodayYyyymmdd(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}${month}${day}`;
}

export function getTourAreaCodes(params: {
  areaCode?: string;
  pageNo?: string;
  numOfRows?: string;
}) {
  return requestTourApi<TourAreaCode>('areaCode2', {
    areaCode: params.areaCode === undefined ? undefined : numericId(params.areaCode, 'areaCode'),
    pageNo: positiveInteger(params.pageNo, 1, MAX_PAGE_NO, 'pageNo'),
    numOfRows: positiveInteger(params.numOfRows, 100, MAX_NUM_OF_ROWS, 'numOfRows')
  });
}

export function getGyeongjuTourPlaces(params: {
  pageNo?: string;
  numOfRows?: string;
  contentTypeId?: string;
}, options?: TourApiRequestOptions) {
  return requestTourApi<TourPlaceSummary>('locationBasedList2', {
    mapX: GYEONGJU_MAP_X,
    mapY: GYEONGJU_MAP_Y,
    radius: GYEONGJU_RADIUS,
    contentTypeId: contentTypeId(params.contentTypeId),
    arrange: 'E',
    pageNo: positiveInteger(params.pageNo, 1, MAX_PAGE_NO, 'pageNo'),
    numOfRows: positiveInteger(params.numOfRows, 20, MAX_NUM_OF_ROWS, 'numOfRows')
  }, options);
}

export function getTourPlaceDetail(contentId: string) {
  return requestTourApi<TourPlaceDetail>('detailCommon2', {
    contentId: numericId(contentId, 'contentId'),
    numOfRows: '1',
    pageNo: '1'
  });
}

export function getTourPlaceIntro(contentId: string, contentType: string) {
  return requestTourApi<TourPlaceDetail>('detailIntro2', {
    contentId: numericId(contentId, 'contentId'),
    contentTypeId: contentTypeId(contentType),
    numOfRows: '1',
    pageNo: '1'
  });
}

export function getTourPlaceImages(params: {
  contentId: string;
  pageNo?: string;
  numOfRows?: string;
}) {
  return requestTourApi<TourImage>('detailImage2', {
    contentId: numericId(params.contentId, 'contentId'),
    imageYN: 'Y',
    pageNo: positiveInteger(params.pageNo, 1, MAX_PAGE_NO, 'pageNo'),
    numOfRows: positiveInteger(params.numOfRows, 20, MAX_NUM_OF_ROWS, 'numOfRows')
  });
}

export function getNearbyTourPlaces(params: {
  mapX: string;
  mapY: string;
  radius?: string;
  pageNo?: string;
  numOfRows?: string;
  contentTypeId?: string;
}) {
  return requestTourApi<TourPlaceSummary>('locationBasedList2', {
    mapX: coordinate(params.mapX, 'mapX'),
    mapY: coordinate(params.mapY, 'mapY'),
    radius: positiveInteger(params.radius, Number(DEFAULT_RADIUS), MAX_RADIUS_M, 'radius'),
    contentTypeId: contentTypeId(params.contentTypeId),
    arrange: 'E',
    pageNo: positiveInteger(params.pageNo, 1, MAX_PAGE_NO, 'pageNo'),
    numOfRows: positiveInteger(params.numOfRows, 20, MAX_NUM_OF_ROWS, 'numOfRows')
  });
}

export function searchGyeongjuTourPlaces(params: {
  keyword: string;
  pageNo?: string;
  numOfRows?: string;
  contentTypeId?: string;
}) {
  const keyword = params.keyword.trim();
  if (!keyword || keyword.length > 60) {
    throw new TourApiError('keyword must be between 1 and 60 characters.', 400);
  }

  return requestTourApi<TourPlaceSummary>('searchKeyword2', {
    keyword,
    areaCode: GYEONGJU_AREA_CODE,
    sigunguCode: GYEONGJU_SIGUNGU_CODE,
    contentTypeId: contentTypeId(params.contentTypeId),
    arrange: 'Q',
    pageNo: positiveInteger(params.pageNo, 1, MAX_PAGE_NO, 'pageNo'),
    numOfRows: positiveInteger(params.numOfRows, 20, MAX_NUM_OF_ROWS, 'numOfRows')
  });
}

export function searchGyeongjuFestivals(params: {
  eventStartDate?: string;
  eventEndDate?: string;
  pageNo?: string;
  numOfRows?: string;
}) {
  const eventStartDate = yyyymmdd(params.eventStartDate, 'eventStartDate') ?? getTodayYyyymmdd();
  const eventEndDate = yyyymmdd(params.eventEndDate, 'eventEndDate');
  if (eventEndDate && eventEndDate < eventStartDate) {
    throw new TourApiError('eventEndDate cannot be earlier than eventStartDate.', 400);
  }

  return requestTourApi<TourPlaceSummary>('searchFestival2', {
    eventStartDate,
    eventEndDate,
    areaCode: GYEONGJU_AREA_CODE,
    sigunguCode: GYEONGJU_SIGUNGU_CODE,
    arrange: 'Q',
    pageNo: positiveInteger(params.pageNo, 1, MAX_PAGE_NO, 'pageNo'),
    numOfRows: positiveInteger(params.numOfRows, 20, MAX_NUM_OF_ROWS, 'numOfRows')
  });
}

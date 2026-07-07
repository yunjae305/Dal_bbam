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
const TOUR_API_CACHE_TTL_SECONDS = Number(process.env.TOUR_API_CACHE_TTL_SECONDS ?? DEFAULT_CACHE_TTL_SECONDS);
const TOUR_API_CACHE_TTL_MS = Number.isFinite(TOUR_API_CACHE_TTL_SECONDS)
  ? TOUR_API_CACHE_TTL_SECONDS * 1000
  : DEFAULT_CACHE_TTL_SECONDS * 1000;

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

type TourApiEnvelope<T> = {
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

async function requestTourApi<T>(path: string, params: Record<string, string | number | undefined>): Promise<TourApiResult<T>> {
  const cacheKey = buildCacheKey(path, params);
  const cached = tourApiCache.get(cacheKey) as CacheEntry<T> | undefined;

  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.value,
      cache: {
        hit: true,
        ttlSeconds: Math.max(0, Math.floor((cached.expiresAt - Date.now()) / 1000)),
        cachedAt: cached.cachedAt
      }
    };
  }

  const response = await fetch(buildTourApiUrl(path, params), {
    headers: {
      Accept: 'application/json'
    },
    cache: 'force-cache',
    next: {
      revalidate: Math.max(1, Math.floor(TOUR_API_CACHE_TTL_MS / 1000))
    }
  });

  if (!response.ok) {
    throw new TourApiError(`TourAPI request failed with status ${response.status}.`, response.status);
  }

  let data: TourApiEnvelope<T>;

  try {
    data = await response.json() as TourApiEnvelope<T>;
  } catch {
    throw new TourApiError('TourAPI returned an invalid JSON response.');
  }

  const header = data.response?.header;

  if (header?.resultCode && header.resultCode !== '0000') {
    throw new TourApiError(header.resultMsg ?? 'TourAPI returned an error.');
  }

  const body = data.response?.body;
  const cachedAt = new Date().toISOString();
  const value = {
    items: normalizeItems(body?.items?.item),
    pageNo: body?.pageNo ?? Number(params.pageNo ?? 1),
    numOfRows: body?.numOfRows ?? Number(params.numOfRows ?? 20),
    totalCount: body?.totalCount ?? 0
  };

  tourApiCache.set(cacheKey, {
    expiresAt: Date.now() + TOUR_API_CACHE_TTL_MS,
    cachedAt,
    value
  });

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
    areaCode: params.areaCode,
    pageNo: params.pageNo ?? '1',
    numOfRows: params.numOfRows ?? '100'
  });
}

export function getGyeongjuTourPlaces(params: {
  pageNo?: string;
  numOfRows?: string;
  contentTypeId?: string;
}) {
  return requestTourApi<TourPlaceSummary>('locationBasedList2', {
    mapX: GYEONGJU_MAP_X,
    mapY: GYEONGJU_MAP_Y,
    radius: GYEONGJU_RADIUS,
    contentTypeId: params.contentTypeId ?? DEFAULT_CONTENT_TYPE_ID,
    arrange: 'E',
    pageNo: params.pageNo ?? '1',
    numOfRows: params.numOfRows ?? '20'
  });
}

export function getTourPlaceDetail(contentId: string) {
  return requestTourApi<TourPlaceDetail>('detailCommon2', {
    contentId,
    defaultYN: 'Y',
    firstImageYN: 'Y',
    areacodeYN: 'Y',
    catcodeYN: 'Y',
    addrinfoYN: 'Y',
    mapinfoYN: 'Y',
    overviewYN: 'Y',
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
    contentId: params.contentId,
    imageYN: 'Y',
    subImageYN: 'Y',
    pageNo: params.pageNo ?? '1',
    numOfRows: params.numOfRows ?? '20'
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
    mapX: params.mapX,
    mapY: params.mapY,
    radius: params.radius ?? DEFAULT_RADIUS,
    contentTypeId: params.contentTypeId ?? DEFAULT_CONTENT_TYPE_ID,
    arrange: 'E',
    pageNo: params.pageNo ?? '1',
    numOfRows: params.numOfRows ?? '20'
  });
}

export function searchGyeongjuTourPlaces(params: {
  keyword: string;
  pageNo?: string;
  numOfRows?: string;
  contentTypeId?: string;
}) {
  return requestTourApi<TourPlaceSummary>('searchKeyword2', {
    keyword: params.keyword,
    areaCode: GYEONGJU_AREA_CODE,
    sigunguCode: GYEONGJU_SIGUNGU_CODE,
    contentTypeId: params.contentTypeId ?? DEFAULT_CONTENT_TYPE_ID,
    arrange: 'Q',
    pageNo: params.pageNo ?? '1',
    numOfRows: params.numOfRows ?? '20'
  });
}

export function searchGyeongjuFestivals(params: {
  eventStartDate?: string;
  eventEndDate?: string;
  pageNo?: string;
  numOfRows?: string;
}) {
  return requestTourApi<TourPlaceSummary>('searchFestival2', {
    eventStartDate: params.eventStartDate ?? getTodayYyyymmdd(),
    eventEndDate: params.eventEndDate,
    areaCode: GYEONGJU_AREA_CODE,
    sigunguCode: GYEONGJU_SIGUNGU_CODE,
    arrange: 'Q',
    pageNo: params.pageNo ?? '1',
    numOfRows: params.numOfRows ?? '20'
  });
}

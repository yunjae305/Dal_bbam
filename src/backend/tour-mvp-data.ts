import { getMvpData } from '@/backend/data';
import { getSupabasePlaces } from '@/backend/supabase/places';
import {
  getGyeongjuTourPlaces,
  getTourPlaceDetail,
  searchGyeongjuFestivals,
  type TourPlaceSummary
} from '@/backend/tour-api';
import type { Lang, MvpData, Place } from '@/shared/types';
import { tourCategory } from '@/shared/tour-category';

const FALLBACK_IMAGE = '/login-spring-bg.png';
const GYEONGJU_CENTER: [number, number] = [35.8562, 129.2247];

// These caches contain only the shared public catalogue. Authentication,
// schedules, reactions and recommendations are never read in this module.
export const PUBLIC_CATALOGUE_BUDGET_MS = 1500;
export const PUBLIC_CATALOGUE_FRESH_MS = 30_000;
const SAMPLE_RETRY_MS = 5_000;
const MAX_STALE_MS = 24 * 60 * 60 * 1000;
const REFRESH_TIMEOUT_MS = 35_000;
type CatalogueEntry = { data: MvpData; fetchedAt: number; freshUntil: number; stale: boolean };
export type PublicCatalogue = MvpData & {
  catalogue: { source: 'database' | 'tour-api' | 'sample'; fallback: boolean; stale: boolean; fetchedAt: string };
};
const publicCatalogue = new Map<Lang, CatalogueEntry>();
const pendingCatalogue = new Map<Lang, Promise<CatalogueEntry>>();

function catalogueSource(data: MvpData): PublicCatalogue['catalogue']['source'] {
  const source = data.places[0]?.source;
  return source === 'database' || source === 'tour-api' ? source : 'sample';
}

function snapshot(entry: CatalogueEntry, stale = entry.stale): PublicCatalogue {
  const source = catalogueSource(entry.data);
  // Callers can filter/reorder their response without mutating the cached
  // catalogue later served to a different visitor.
  const data = structuredClone(entry.data);
  if (source === 'sample') data.places = data.places.map(place => ({ ...place, source: 'sample' }));
  return { ...data, catalogue: {
    source, fallback: source === 'sample', stale, fetchedAt: new Date(entry.fetchedAt).toISOString()
  } };
}

async function withinBudget<T>(promise: Promise<T>, milliseconds: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), milliseconds); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function refreshCatalogue(lang: Lang): Promise<CatalogueEntry> {
  const running = pendingCatalogue.get(lang);
  if (running) return running;
  const request = (async () => {
    const data = await withinBudget(loadCatalogue(lang).catch(() => getMvpData(lang)), REFRESH_TIMEOUT_MS)
      ?? getMvpData(lang);
    const now = Date.now();
    const previous = publicCatalogue.get(lang);
    const fallback = catalogueSource(data) === 'sample';
    // An outage must not replace a recent, useful live catalogue with samples.
    const next = fallback && previous && catalogueSource(previous.data) !== 'sample' && now - previous.fetchedAt < MAX_STALE_MS
      ? { ...previous, freshUntil: now + SAMPLE_RETRY_MS, stale: true }
      : { data, fetchedAt: now, freshUntil: now + (fallback ? SAMPLE_RETRY_MS : PUBLIC_CATALOGUE_FRESH_MS), stale: false };
    publicCatalogue.set(lang, next);
    return next;
  })();
  pendingCatalogue.set(lang, request);
  void request.finally(() => {
    if (pendingCatalogue.get(lang) === request) pendingCatalogue.delete(lang);
  });
  return request;
}

const CONTENT_TYPE_TAG: Record<string, string> = {
  '12': '관광지',
  '14': '문화시설',
  '15': '축제',
  '28': '체험',
  '32': '숙박',
  '38': '쇼핑',
  '39': '맛집'
};

function field(item: TourPlaceSummary, key: string): string {
  const value = item[key];
  return value === null || value === undefined ? '' : String(value);
}

function numberField(item: TourPlaceSummary, key: string): number | null {
  const raw = field(item, key).trim();
  // Number('') is 0, which would silently place the item in the Gulf of Guinea.
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function getContentTypeId(item: TourPlaceSummary, fallback: string): string {
  return field(item, 'contenttypeid') || field(item, 'contentTypeId') || fallback;
}

async function getOverview(contentId: string): Promise<string> {
  if (!contentId) {
    return '';
  }

  try {
    const detail = await getTourPlaceDetail(contentId);
    return stripHtml(field(detail.items[0] ?? {}, 'overview'));
  } catch {
    return '';
  }
}

export function mapTourPlaceSummary(
  item: TourPlaceSummary,
  overview = '',
  fallbackContentTypeId = '12'
): Place {
  const contentTypeId = getContentTypeId(item, fallbackContentTypeId);
  const title = field(item, 'title') || '경주 관광지';
  const address = [field(item, 'addr1'), field(item, 'addr2')].filter(Boolean).join(' ') || '경주시';
  const category = tourCategory(contentTypeId, field(item, 'cat1'), field(item, 'cat2'));
  const tag = CONTENT_TYPE_TAG[contentTypeId] ?? category;
  const mapY = numberField(item, 'mapy');
  const mapX = numberField(item, 'mapx');

  return {
    id: field(item, 'contentid') || title,
    contentId: field(item, 'contentid') || title,
    category,
    name: title,
    description: overview || `${address}에 위치한 경주 ${tag} 정보입니다.`,
    address,
    distance: field(item, 'dist') ? `${field(item, 'dist')}m` : '경주',
    rating: 0,
    bestTime: category === 'festival' ? '일정 확인' : '',
    image: field(item, 'firstimage') || field(item, 'firstimage2') || FALLBACK_IMAGE,
    tags: [tag, category, field(item, 'cat3')].filter(Boolean),
    coordinates: [mapY ?? GYEONGJU_CENTER[0], mapX ?? GYEONGJU_CENTER[1]],
    source: 'tour-api',
    translations: {
      en: {
        name: title,
        description: overview || `${address} travel information in Gyeongju.`
      },
      ja: {
        name: title,
        description: overview || `${address}の慶州観光情報です。`
      },
      zh: {
        name: title,
        description: overview || `${address}的庆州旅游信息。`
      }
    }
  };
}

async function loadTourPlaces(contentTypeId: string, numOfRows: string) {
  const result = contentTypeId === '15'
    ? await searchGyeongjuFestivals({ numOfRows })
    : await getGyeongjuTourPlaces({ contentTypeId, numOfRows });

  return result.items.map(item => ({ item, contentTypeId }));
}

async function loadCatalogue(lang: Lang): Promise<MvpData> {
  const fallback = getMvpData(lang);
  const supabasePlaces = await getSupabasePlaces(lang).catch(() => []);

  if (supabasePlaces.length) {
    return {
      ...fallback,
      places: supabasePlaces
    };
  }

  // Every locale reuses the Korean TourAPI list: the mapped translations fall
  // back to Korean text, which beats the 5-item sample catalogue.
  try {
    const groups = await Promise.allSettled([
      loadTourPlaces('12', '6'),
      loadTourPlaces('39', '4'),
      loadTourPlaces('32', '3'),
      loadTourPlaces('15', '3')
    ]);

    const rawPlaces = groups.flatMap(group => group.status === 'fulfilled' ? group.value : []);
    const uniquePlaces = Array.from(
      new Map(rawPlaces.map(place => [field(place.item, 'contentid') || field(place.item, 'title'), place])).values()
    ).slice(0, 12);

    if (!uniquePlaces.length) {
      return fallback;
    }

    const overviews = await Promise.all(uniquePlaces.map(place => getOverview(field(place.item, 'contentid'))));
    const places = uniquePlaces.map((place, index) =>
      mapTourPlaceSummary(place.item, overviews[index], place.contentTypeId)
    );

    return {
      ...fallback,
      places
    };
  } catch {
    return fallback;
  }
}

export async function getTourMvpData(lang: Lang = 'ko'): Promise<PublicCatalogue> {
  const now = Date.now();
  const cached = publicCatalogue.get(lang);
  if (cached && cached.freshUntil > now) return snapshot(cached);
  const refresh = refreshCatalogue(lang);
  if (cached && now - cached.fetchedAt < MAX_STALE_MS) {
    // Stale data renders immediately while one shared refresh runs per locale.
    return snapshot(cached, catalogueSource(cached.data) !== 'sample');
  }
  const fresh = await withinBudget(refresh, PUBLIC_CATALOGUE_BUDGET_MS);
  if (fresh) return snapshot(fresh);
  // Cold starts have an explicit response budget. The in-flight refresh can
  // populate the cache when providers recover without holding up this render.
  const fallback = { data: getMvpData(lang), fetchedAt: Date.now(), freshUntil: Date.now() + SAMPLE_RETRY_MS, stale: false };
  const current = publicCatalogue.get(lang);
  if (!current || Date.now() - current.fetchedAt >= MAX_STALE_MS) publicCatalogue.set(lang, fallback);
  return snapshot(publicCatalogue.get(lang) ?? fallback);
}

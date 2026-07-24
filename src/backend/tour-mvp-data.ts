import { getMvpData } from '@/backend/data';
import { getSupabasePlaces } from '@/backend/supabase/places';
import {
  getGyeongjuTourPlaces,
  getTourPlaceDetail,
  searchGyeongjuFestivals,
  type TourPlaceSummary
} from '@/backend/tour-api';
import type { Lang, MvpData, Place } from '@/shared/types';

const FALLBACK_IMAGE = '/login-spring-bg.png';
const GYEONGJU_CENTER: [number, number] = [35.8562, 129.2247];

const CONTENT_TYPE_CATEGORY: Record<string, Place['category']> = {
  '12': 'attraction',
  '14': 'heritage',
  '15': 'festival',
  '28': 'experience',
  '32': 'lodging',
  '38': 'attraction',
  '39': 'food'
};

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
  const value = Number(field(item, key));
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
  const category = CONTENT_TYPE_CATEGORY[contentTypeId] ?? 'attraction';
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
    rating: 4.7,
    bestTime: category === 'food' ? '12:30 추천' : category === 'festival' ? '일정 확인' : '09:00 추천',
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

export async function getTourMvpData(lang: Lang = 'ko'): Promise<MvpData> {
  const fallback = getMvpData(lang);
  const supabasePlaces = await getSupabasePlaces(lang);

  if (supabasePlaces.length) {
    return {
      ...fallback,
      places: supabasePlaces
    };
  }

  if (lang !== 'ko') {
    return fallback;
  }

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

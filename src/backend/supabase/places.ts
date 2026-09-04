import { getSupabaseEnv } from '@/backend/supabase/env';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';
import { placeCategories, type Lang, type Place, type PlaceCategory } from '@/shared/types';

type PlaceRow = {
  id: string;
  content_id: string | null;
  category: string | null;
  name: string | null;
  description: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  image_url: string | null;
  tags: string[] | null;
  ai_description_ko: string | null;
  ai_description_en: string | null;
  ai_description_zh: string | null;
  ai_description_ja: string | null;
  created_at?: string | null;
  place_translations?: Array<{
    lang: string;
    name: string | null;
    description: string | null;
    overview: string | null;
  }> | null;
};

const DEFAULT_IMAGE = '/login-spring-bg.png';
// The synced catalogue is several hundred rows; search filters in memory, so
// a small page silently hides matches.
export const PLACE_QUERY_LIMIT = 1000;
const GYEONGJU_CENTER: [number, number] = [35.8562, 129.2247];
const legacyCategories: Record<string, PlaceCategory> = {
  문화재: 'heritage',
  관광지: 'attraction',
  음식점: 'food',
  숙박: 'lodging',
  축제: 'festival',
  자연: 'nature',
  체험: 'experience'
};

export function normalizePlaceCategory(category: string | null): PlaceCategory {
  if (category && placeCategories.includes(category as PlaceCategory)) {
    return category as PlaceCategory;
  }

  return category ? legacyCategories[category] ?? 'attraction' : 'attraction';
}

function translationFor(row: PlaceRow, lang: Lang) {
  return row.place_translations?.find(item => item.lang === lang);
}

function descriptionForLang(row: PlaceRow, lang: Lang): string {
  const translated = translationFor(row, lang);
  const aiDescription = lang === 'en'
    ? row.ai_description_en
    : lang === 'ja'
      ? row.ai_description_ja
      : lang === 'zh'
        ? row.ai_description_zh
        : row.ai_description_ko;
  return translated?.description || translated?.overview || aiDescription || row.description || '';
}

function nameForLang(row: PlaceRow, lang: Lang): string {
  return translationFor(row, lang)?.name || row.name || '경주 관광지';
}

function mapPlaceRow(row: PlaceRow, lang: Lang): Place {
  const name = nameForLang(row, lang);
  const description = descriptionForLang(row, lang) || '경주 관광 정보입니다.';
  const category = normalizePlaceCategory(row.category);

  return {
    id: row.content_id || row.id,
    contentId: row.content_id || row.id,
    category,
    name,
    description,
    address: row.address || '경주시',
    distance: '경주',
    rating: 0,
    bestTime: '',
    image: row.image_url || DEFAULT_IMAGE,
    tags: row.tags?.length ? row.tags : [category],
    coordinates: [
      typeof row.lat === 'number' ? row.lat : GYEONGJU_CENTER[0],
      typeof row.lng === 'number' ? row.lng : GYEONGJU_CENTER[1]
    ],
    source: 'database',
    translations: {
      en: { name: nameForLang(row, 'en'), description: descriptionForLang(row, 'en') || description },
      ja: { name: nameForLang(row, 'ja'), description: descriptionForLang(row, 'ja') || description },
      zh: { name: nameForLang(row, 'zh'), description: descriptionForLang(row, 'zh') || description }
    }
  };
}

export async function getSupabasePlaces(lang: Lang = 'ko'): Promise<Place[]> {
  const env = getSupabaseEnv();
  if (!env.url || !env.serverKey) return [];

  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('places')
    .select('id, content_id, category, name, description, address, lat, lng, image_url, tags, ai_description_ko, ai_description_en, ai_description_zh, ai_description_ja, created_at, place_translations(lang, name, description, overview)')
    .order('created_at', { ascending: false })
    .order('name', { ascending: true })
    .limit(PLACE_QUERY_LIMIT);

  if (error || !data?.length) return [];
  return data.map(row => mapPlaceRow(row as PlaceRow, lang));
}

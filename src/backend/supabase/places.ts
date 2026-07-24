import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '@/backend/supabase/env';
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
};

const DEFAULT_IMAGE = '/login-spring-bg.png';
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

function descriptionForLang(row: PlaceRow, lang: Lang): string {
  if (lang === 'en') return row.ai_description_en || row.description || '';
  if (lang === 'ja') return row.ai_description_ja || row.description || '';
  if (lang === 'zh') return row.ai_description_zh || row.description || '';
  return row.ai_description_ko || row.description || '';
}

function mapPlaceRow(row: PlaceRow, lang: Lang): Place {
  const name = row.name || '경주 관광지';
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
    rating: 4.7,
    bestTime: category === 'food' ? '12:30 추천' : '09:00 추천',
    image: row.image_url || DEFAULT_IMAGE,
    tags: row.tags?.length ? row.tags : [category],
    coordinates: [
      typeof row.lat === 'number' ? row.lat : GYEONGJU_CENTER[0],
      typeof row.lng === 'number' ? row.lng : GYEONGJU_CENTER[1]
    ],
    source: 'database',
    translations: {
      en: {
        name,
        description: row.ai_description_en || row.description || description
      },
      ja: {
        name,
        description: row.ai_description_ja || row.description || description
      },
      zh: {
        name,
        description: row.ai_description_zh || row.description || description
      }
    }
  };
}

export async function getSupabasePlaces(lang: Lang = 'ko'): Promise<Place[]> {
  const env = getSupabaseEnv();
  if (!env.url || !env.serverKey) return [];

  const supabase = createClient(env.url, env.serverKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await supabase
    .from('places')
    .select('id, content_id, category, name, description, address, lat, lng, image_url, tags, ai_description_ko, ai_description_en, ai_description_zh, ai_description_ja, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error || !data?.length) return [];
  return data.map(row => mapPlaceRow(row as PlaceRow, lang));
}

import { normalizePlaceCategory } from '@/backend/supabase/places';
import type { Lang, Place, PlaceDetail, PlaceSummary } from '@/shared/types';

export function placeToSummary(place: Place): PlaceSummary {
  return {
    contentId: place.contentId,
    category: place.category,
    name: place.name,
    description: place.description,
    address: place.address,
    imageUrl: place.image,
    coordinates: place.coordinates,
    tags: place.tags,
    rating: place.rating,
    source: place.source ?? 'sample'
  };
}

export type DetailRow = {
  content_id?: string | null;
  category?: string | null;
  name?: string | null;
  description?: string | null;
  overview?: string | null;
  address?: string | null;
  phone?: string | null;
  opening_hours?: string | null;
  homepage_url?: string | null;
  lat?: number | null;
  lng?: number | null;
  image_url?: string | null;
  tags?: string[] | null;
  source?: string | null;
  updated_at?: string | null;
  place_translations?: Array<{
    lang: string;
    name: string | null;
    description: string | null;
    overview: string | null;
    opening_hours: string | null;
  }> | null;
};

export function rowToPlaceDetail(row: DetailRow, lang: Lang): PlaceDetail {
  const translation = row.place_translations?.find(item => item.lang === lang);
  const description = translation?.description || row.description || row.overview || '';
  const overview = translation?.overview || row.overview || row.description || '';
  const imageUrl = row.image_url || '/login-spring-bg.png';

  return {
    contentId: row.content_id || '',
    category: normalizePlaceCategory(row.category ?? null),
    name: translation?.name || row.name || '경주 관광지',
    description,
    overview,
    address: row.address || '경주시',
    phone: row.phone || undefined,
    openingHours: translation?.opening_hours || row.opening_hours || undefined,
    homepageUrl: row.homepage_url || undefined,
    imageUrl,
    images: [imageUrl],
    coordinates: [Number(row.lat ?? 35.8562), Number(row.lng ?? 129.2247)],
    tags: row.tags ?? [],
    source: row.source === 'tour-api' ? 'tour-api' : 'database',
    fetchedAt: row.updated_at || undefined
  };
}

export function stripProviderHtml(value: string): string {
  return value
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

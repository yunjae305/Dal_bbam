import { NextRequest } from 'next/server';
import { apiData } from '@/backend/http';
import { getTourMvpData } from '@/backend/tour-mvp-data';
import { isLang } from '@/shared/i18n';
import { placeCategories, type Category, type Lang, type PlaceSummary } from '@/shared/types';

function getLang(request: NextRequest): Lang {
  const lang = request.nextUrl.searchParams.get('lang');
  return isLang(lang) ? lang : 'ko';
}

function getCategory(request: NextRequest): Category {
  const category = request.nextUrl.searchParams.get('category');
  return placeCategories.includes(category as (typeof placeCategories)[number])
    ? category as Category
    : 'all';
}

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase();
  const category = getCategory(request);
  const mvp = await getTourMvpData(getLang(request));
  const items: PlaceSummary[] = mvp.places
    .filter(place => category === 'all' || place.category === category)
    .filter(place => !q || [place.name, place.description, place.address, ...place.tags]
      .join(' ')
      .toLowerCase()
      .includes(q))
    .map(place => ({
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
    }));

  return apiData(items, {
    meta: { query: q, category, count: items.length },
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800' }
  });
}

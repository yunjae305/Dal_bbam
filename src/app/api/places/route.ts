import { NextRequest, NextResponse } from 'next/server';
import { getLocalizedPlaces } from '@/backend/data';
import type { Category, Lang } from '@/shared/types';

function getLang(request: NextRequest): Lang {
  const lang = request.nextUrl.searchParams.get('lang');

  if (lang === 'en' || lang === 'ja' || lang === 'zh') {
    return lang;
  }

  return 'ko';
}

function getCategory(request: NextRequest): Category {
  const category = request.nextUrl.searchParams.get('category');

  if (category === '문화재' || category === '음식점' || category === '숙박' || category === '축제') {
    return category;
  }

  return '전체';
}

export function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase();
  const category = getCategory(request);
  const places = getLocalizedPlaces(getLang(request))
    .filter(place => category === '전체' || place.category === category)
    .filter(place => {
      if (!q) {
        return true;
      }

      return [place.name, place.description, place.address, place.category, ...place.tags].join(' ').toLowerCase().includes(q);
    });

  return NextResponse.json({ items: places });
}

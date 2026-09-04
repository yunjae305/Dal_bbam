import { NextRequest } from 'next/server';
import { apiData } from '@/backend/http';
import { getTourMvpData } from '@/backend/tour-mvp-data';
import { isLang } from '@/shared/i18n';
import type { Lang } from '@/shared/types';

function getLang(request: NextRequest): Lang {
  const lang = request.nextUrl.searchParams.get('lang');
  return isLang(lang) ? lang : 'ko';
}

export async function GET(request: NextRequest) {
  return apiData(await getTourMvpData(getLang(request)));
}

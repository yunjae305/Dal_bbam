import { NextRequest, NextResponse } from 'next/server';
import { getTourMvpData } from '@/backend/tour-mvp-data';
import type { Lang } from '@/shared/types';

function getLang(request: NextRequest): Lang {
  const lang = request.nextUrl.searchParams.get('lang');

  if (lang === 'en' || lang === 'ja' || lang === 'zh') {
    return lang;
  }

  return 'ko';
}

export async function GET(request: NextRequest) {
  return NextResponse.json(await getTourMvpData(getLang(request)));
}

import { NextRequest, NextResponse } from 'next/server';
import { getMvpData } from '@/backend/data';
import type { Lang } from '@/shared/types';

function getLang(request: NextRequest): Lang {
  const lang = request.nextUrl.searchParams.get('lang');

  if (lang === 'en' || lang === 'ja' || lang === 'zh') {
    return lang;
  }

  return 'ko';
}

export function GET(request: NextRequest) {
  return NextResponse.json(getMvpData(getLang(request)));
}

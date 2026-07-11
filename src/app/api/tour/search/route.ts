import { NextRequest, NextResponse } from 'next/server';
import { searchGyeongjuTourPlaces, TOUR_API_CACHE_CONTROL, TourApiConfigError, TourApiError } from '@/backend/tour-api';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const keyword = params.get('keyword')?.trim();

    if (!keyword) {
      return NextResponse.json({ error: 'keyword is required.' }, { status: 400 });
    }

    const result = await searchGyeongjuTourPlaces({
      keyword,
      pageNo: params.get('pageNo') ?? undefined,
      numOfRows: params.get('numOfRows') ?? undefined,
      contentTypeId: params.get('contentTypeId') ?? undefined
    });

    return NextResponse.json(result, { headers: { 'Cache-Control': TOUR_API_CACHE_CONTROL } });
  } catch (error) {
    if (error instanceof TourApiConfigError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (error instanceof TourApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Failed to search TourAPI places.' }, { status: 500 });
  }
}

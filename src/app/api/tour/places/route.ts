import { NextRequest, NextResponse } from 'next/server';
import { getGyeongjuTourPlaces, TOUR_API_CACHE_CONTROL, TourApiConfigError, TourApiError } from '@/backend/tour-api';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const result = await getGyeongjuTourPlaces({
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

    return NextResponse.json({ error: 'Failed to load TourAPI places.' }, { status: 500 });
  }
}

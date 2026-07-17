import { NextRequest, NextResponse } from 'next/server';
import { searchGyeongjuFestivals, TOUR_API_CACHE_CONTROL, TourApiConfigError, TourApiError } from '@/backend/tour-api';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const result = await searchGyeongjuFestivals({
      eventStartDate: params.get('eventStartDate') ?? undefined,
      eventEndDate: params.get('eventEndDate') ?? undefined,
      pageNo: params.get('pageNo') ?? undefined,
      numOfRows: params.get('numOfRows') ?? undefined
    });

    return NextResponse.json(result, { headers: { 'Cache-Control': TOUR_API_CACHE_CONTROL } });
  } catch (error) {
    if (error instanceof TourApiConfigError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (error instanceof TourApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Failed to load TourAPI festivals.' }, { status: 500 });
  }
}

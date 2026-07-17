import { NextResponse } from 'next/server';
import { getTourPlaceDetail, TOUR_API_CACHE_CONTROL, TourApiConfigError, TourApiError } from '@/backend/tour-api';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ contentId: string }> }) {
  try {
    const { contentId } = await context.params;

    if (!contentId) {
      return NextResponse.json({ error: 'contentId is required.' }, { status: 400 });
    }

    const result = await getTourPlaceDetail(contentId);

    return NextResponse.json({
      item: result.items[0] ?? null
    }, { headers: { 'Cache-Control': TOUR_API_CACHE_CONTROL } });
  } catch (error) {
    if (error instanceof TourApiConfigError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (error instanceof TourApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Failed to load TourAPI place detail.' }, { status: 500 });
  }
}

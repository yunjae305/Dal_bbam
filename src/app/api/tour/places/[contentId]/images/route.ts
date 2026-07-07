import { NextRequest, NextResponse } from 'next/server';
import { getTourPlaceImages, TourApiConfigError, TourApiError } from '@/backend/tour-api';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, context: { params: Promise<{ contentId: string }> }) {
  try {
    const { contentId } = await context.params;

    if (!contentId) {
      return NextResponse.json({ error: 'contentId is required.' }, { status: 400 });
    }

    const params = request.nextUrl.searchParams;
    const result = await getTourPlaceImages({
      contentId,
      pageNo: params.get('pageNo') ?? undefined,
      numOfRows: params.get('numOfRows') ?? undefined
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TourApiConfigError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (error instanceof TourApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Failed to load TourAPI place images.' }, { status: 500 });
  }
}

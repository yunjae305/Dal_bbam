import { NextRequest, NextResponse } from 'next/server';
import { getNearbyTourPlaces, TourApiConfigError, TourApiError } from '@/backend/tour-api';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const mapX = params.get('mapX')?.trim();
    const mapY = params.get('mapY')?.trim();

    if (!mapX || !mapY) {
      return NextResponse.json({ error: 'mapX and mapY are required.' }, { status: 400 });
    }

    const result = await getNearbyTourPlaces({
      mapX,
      mapY,
      radius: params.get('radius') ?? undefined,
      pageNo: params.get('pageNo') ?? undefined,
      numOfRows: params.get('numOfRows') ?? undefined,
      contentTypeId: params.get('contentTypeId') ?? undefined
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TourApiConfigError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (error instanceof TourApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Failed to load nearby TourAPI places.' }, { status: 500 });
  }
}

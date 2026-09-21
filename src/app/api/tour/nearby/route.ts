import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/backend/http';
import { getNearbyTourPlaces, TOUR_API_CACHE_CONTROL, TourApiConfigError, TourApiError } from '@/backend/tour-api';
import { mapTourPlaceSummary } from '@/backend/tour-mvp-data';
import { isValidCoordinate } from '@/backend/geo';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const mapX = params.get('mapX')?.trim();
    const mapY = params.get('mapY')?.trim();

    if (!mapX || !mapY) {
      return apiError('INVALID_QUERY', 'mapX and mapY are required.');
    }

    const point = { lat: Number(mapY), lng: Number(mapX) };
    if (!isValidCoordinate(point.lat, point.lng)) {
      return apiError('INVALID_QUERY', 'Valid mapX and mapY coordinates are required.');
    }

    const result = await getNearbyTourPlaces({
      mapX,
      mapY,
      radius: params.get('radius') ?? undefined,
      pageNo: params.get('pageNo') ?? undefined,
      numOfRows: params.get('numOfRows') ?? undefined,
      contentTypeId: params.get('contentTypeId') ?? undefined
    });

    return NextResponse.json({
      ...result,
      places: result.items.map(item => mapTourPlaceSummary(item))
    }, { headers: { 'Cache-Control': TOUR_API_CACHE_CONTROL } });
  } catch (error) {
    if (error instanceof TourApiConfigError) {
      return apiError('TOUR_API_NOT_CONFIGURED', 'TourAPI 키가 설정되지 않았습니다.', 500);
    }

    if (error instanceof TourApiError) {
      return apiError(error.status === 400 ? 'INVALID_QUERY' : 'TOUR_API_ERROR', error.message, error.status);
    }

    return apiError('TOUR_API_FAILED', '주변 관광지를 불러오지 못했습니다.', 500);
  }
}

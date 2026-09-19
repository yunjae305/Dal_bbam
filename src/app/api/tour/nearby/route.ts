import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/backend/http';
import { getNearbyTourPlaces, TOUR_API_CACHE_CONTROL, TourApiConfigError, TourApiError } from '@/backend/tour-api';
import { mapTourPlaceSummary } from '@/backend/tour-mvp-data';
import { isInGyeongjuServiceArea } from '@/shared/service-area';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const mapX = params.get('mapX')?.trim();
    const mapY = params.get('mapY')?.trim();

    if (!mapX || !mapY) {
      return apiError('INVALID_QUERY', 'mapX and mapY are required.');
    }

    // Without this, a traveler still in Seoul got Seoul parks back as "nearby"
    // attractions and one of them became the route destination.
    const point = { lat: Number(mapY), lng: Number(mapX) };
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
      return apiError('INVALID_QUERY', 'mapX and mapY must be numbers.');
    }
    if (!isInGyeongjuServiceArea(point)) {
      return apiError('OUTSIDE_GYEONGJU', '경주 서비스 권역 밖의 위치입니다.', 422);
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

import { NextRequest } from 'next/server';
import { apiData, apiError } from '@/backend/http';
import { searchGyeongjuTourPlaces, TOUR_API_CACHE_CONTROL, TourApiConfigError, TourApiError } from '@/backend/tour-api';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const keyword = params.get('keyword')?.trim();

    if (!keyword) {
      return apiError('INVALID_QUERY', 'keyword is required.');
    }

    const result = await searchGyeongjuTourPlaces({
      keyword,
      pageNo: params.get('pageNo') ?? undefined,
      numOfRows: params.get('numOfRows') ?? undefined,
      contentTypeId: params.get('contentTypeId') ?? undefined
    });

    return apiData(result, { headers: { 'Cache-Control': TOUR_API_CACHE_CONTROL } });
  } catch (error) {
    if (error instanceof TourApiConfigError) {
      return apiError('TOUR_API_NOT_CONFIGURED', 'TourAPI 키가 설정되지 않았습니다.', 500);
    }

    if (error instanceof TourApiError) {
      return apiError(error.status === 400 ? 'INVALID_QUERY' : 'TOUR_API_ERROR', error.message, error.status);
    }

    return apiError('TOUR_API_FAILED', 'TourAPI 관광지 검색에 실패했습니다.', 500);
  }
}

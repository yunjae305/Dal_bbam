import { NextRequest } from 'next/server';
import { apiData, apiError } from '@/backend/http';
import { getTourAreaCodes, TOUR_API_CACHE_CONTROL, TourApiConfigError, TourApiError } from '@/backend/tour-api';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const result = await getTourAreaCodes({
      areaCode: params.get('areaCode') ?? undefined,
      pageNo: params.get('pageNo') ?? undefined,
      numOfRows: params.get('numOfRows') ?? undefined
    });

    return apiData(result, { headers: { 'Cache-Control': TOUR_API_CACHE_CONTROL } });
  } catch (error) {
    if (error instanceof TourApiConfigError) {
      return apiError('TOUR_API_NOT_CONFIGURED', 'TourAPI 키가 설정되지 않았습니다.', 500);
    }

    if (error instanceof TourApiError) {
      return apiError(error.status === 400 ? 'INVALID_QUERY' : 'TOUR_API_ERROR', error.message, error.status);
    }

    return apiError('TOUR_API_FAILED', 'TourAPI 지역 코드를 불러오지 못했습니다.', 500);
  }
}

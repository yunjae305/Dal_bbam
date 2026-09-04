import { apiData, apiError } from '@/backend/http';
import { getTourPlaceDetail, TOUR_API_CACHE_CONTROL, TourApiConfigError, TourApiError } from '@/backend/tour-api';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ contentId: string }> }) {
  try {
    const { contentId } = await context.params;

    if (!contentId) {
      return apiError('INVALID_CONTENT_ID', 'contentId is required.');
    }

    const result = await getTourPlaceDetail(contentId);

    return apiData({
      item: result.items[0] ?? null
    }, { headers: { 'Cache-Control': TOUR_API_CACHE_CONTROL } });
  } catch (error) {
    if (error instanceof TourApiConfigError) {
      return apiError('TOUR_API_NOT_CONFIGURED', 'TourAPI 키가 설정되지 않았습니다.', 500);
    }

    if (error instanceof TourApiError) {
      return apiError(error.status === 400 ? 'INVALID_QUERY' : 'TOUR_API_ERROR', error.message, error.status);
    }

    return apiError('TOUR_API_FAILED', 'TourAPI 관광지 상세 정보를 불러오지 못했습니다.', 500);
  }
}

import { NextRequest } from 'next/server';
import { apiData, apiError, checkRateLimit, getUserDataContext, isErrorContext } from '@/backend/http';
import { getOrCreateNarration } from '@/backend/narration';
import { isLang } from '@/shared/i18n';
import { isFeatureEnabled } from '@/backend/features';

type RouteContext = { params: Promise<{ contentId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  if (!isFeatureEnabled('ai')) return apiError('FEATURE_DISABLED', 'AI 해설 기능이 비활성화되어 있습니다.', 503);
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  if (!await checkRateLimit(context, 'ai:narration', 15)) {
    return apiError('RATE_LIMITED', '잠시 후 다시 시도해 주세요.', 429);
  }

  const { contentId } = await params;
  const langParam = request.nextUrl.searchParams.get('lang');
  const lang = isLang(langParam) ? langParam : 'ko';

  try {
    const result = await getOrCreateNarration(contentId, lang, context.user.actorKey);
    return apiData(result.narration, {
      meta: { fallback: result.fallback },
      headers: { 'Cache-Control': 'private, no-store' }
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'PLACE_GROUNDING_NOT_FOUND') {
      return apiError('PLACE_NOT_FOUND', '해설할 관광지를 찾을 수 없습니다.', 404);
    }
    return apiError('NARRATION_FAILED', '해설을 만들 수 없습니다.', 500);
  }
}

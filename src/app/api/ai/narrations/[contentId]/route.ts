import { NextRequest } from 'next/server';
import { apiData, apiError, checkRateLimit, getUserDataContext, isErrorContext, rateLimitError } from '@/backend/http';
import { getOrCreateNarration } from '@/backend/narration';
import { isLang } from '@/shared/i18n';

type RouteContext = { params: Promise<{ contentId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  // With AI switched off the narration falls back to the template text (isAiGenerated: false).
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const rateLimit = await checkRateLimit(context, 'ai:narration', 15);
  if (rateLimit !== 'ok') return rateLimitError(rateLimit, '잠시 후 다시 시도해 주세요.');

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

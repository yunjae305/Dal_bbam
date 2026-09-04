import { NextRequest } from 'next/server';
import { getBadges } from '@/backend/badges';
import { apiData, apiError, getUserDataContext, isErrorContext } from '@/backend/http';
import { isLang } from '@/shared/i18n';

export async function GET(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const langParam = request.nextUrl.searchParams.get('lang');
  const lang = isLang(langParam) ? langParam : 'ko';
  try {
    return apiData(await getBadges(context.db, context.user.actorKey, lang), {
      headers: { 'Cache-Control': 'private, no-store' }
    });
  } catch (error) {
    console.error('[badges] read failed', error instanceof Error ? error.message : error);
    return apiError('BADGES_READ_FAILED', '배지 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 503);
  }
}

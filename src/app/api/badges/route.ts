import { NextRequest } from 'next/server';
import { getBadges } from '@/backend/badges';
import { apiData, getUserDataContext, isErrorContext } from '@/backend/http';
import { isLang } from '@/shared/i18n';

export async function GET(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const langParam = request.nextUrl.searchParams.get('lang');
  const lang = isLang(langParam) ? langParam : 'ko';
  return apiData(await getBadges(context.db, context.user.actorKey, lang), {
    headers: { 'Cache-Control': 'private, no-store' }
  });
}

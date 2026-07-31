import { NextRequest } from 'next/server';
import { apiData, getUserDataContext, isErrorContext } from '@/backend/http';
import { rankPersonalizedPlaces } from '@/backend/personalize';
import { placeToSummary } from '@/backend/place-mapper';
import { normalizePlaceCategory } from '@/backend/supabase/places';
import { getTourMvpData } from '@/backend/tour-mvp-data';
import { isLang } from '@/shared/i18n';
import type { Lang, PlaceCategory } from '@/shared/types';

type EventRow = { places: { content_id: string | null; category: string | null } | null };
type CartRow = { places: { category: string | null } | null };

export async function GET(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;

  const langParam = request.nextUrl.searchParams.get('lang');
  const lang: Lang = isLang(langParam) ? langParam : 'ko';

  const [{ data: events }, { data: cartRows }, mvpData] = await Promise.all([
    context.db
      .from('place_events')
      .select('places(content_id, category)')
      .eq('actor_key', context.user.actorKey)
      .eq('event_type', 'view')
      .order('created_at', { ascending: false })
      .limit(100),
    context.db
      .from('cart_items')
      .select('places(category)')
      .eq('actor_key', context.user.actorKey)
      .limit(50),
    getTourMvpData(lang)
  ]);

  const viewedContentIds: string[] = [];
  const viewedCategories: PlaceCategory[] = [];
  for (const row of (events ?? []) as unknown as EventRow[]) {
    if (!row.places) continue;
    if (row.places.content_id) viewedContentIds.push(row.places.content_id);
    viewedCategories.push(normalizePlaceCategory(row.places.category));
  }
  const cartCategories = ((cartRows ?? []) as unknown as CartRow[])
    .filter(row => row.places)
    .map(row => normalizePlaceCategory(row.places?.category ?? null));

  const recommendations = rankPersonalizedPlaces(
    mvpData.places.map(placeToSummary),
    { viewedContentIds, viewedCategories, cartCategories }
  );

  return apiData({
    recommendations: recommendations.map(({ place, reasonCategory }) => ({ ...place, reasonCategory }))
  }, {
    meta: {
      basedOn: {
        viewCount: viewedCategories.length,
        cartCount: cartCategories.length
      }
    },
    headers: { 'Cache-Control': 'private, no-store' }
  });
}

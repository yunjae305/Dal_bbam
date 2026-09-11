import { NextRequest } from 'next/server';
import { apiData } from '@/backend/http';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';
import { getTourMvpData } from '@/backend/tour-mvp-data';
import { placeToSummary } from '@/backend/place-mapper';
import { isLang } from '@/shared/i18n';
import { placeCategories, type Lang } from '@/shared/types';

export async function GET(request: NextRequest) {
  const langParam = request.nextUrl.searchParams.get('lang');
  const lang: Lang = isLang(langParam) ? langParam : 'ko';
  const data = await getTourMvpData(lang);
  const summaries = data.places.map(placeToSummary);
  const score = new Map<string, number>();
  const db = createSupabaseAdminClient();

  if (db) {
    const since = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: ranking, error: rankingError } = await db.rpc('get_place_view_ranking', { since_date: since });
    if (!rankingError && ranking) {
      for (const row of ranking) score.set(String(row.content_id), Number(row.view_count));
    } else {
      // Rolling deployments can serve the older schema until migration is applied.
      const { data: events } = await db
        .from('place_events')
        .select('place_id, places(content_id)')
        .gte('event_date', since)
        .eq('event_type', 'view')
        .limit(5000);

      for (const event of events ?? []) {
        const relation = event.places as unknown as { content_id?: string } | null;
        const contentId = relation?.content_id;
        if (contentId) score.set(contentId, (score.get(contentId) ?? 0) + 1);
      }
    }
  }

  const popular = [...summaries]
    .sort((a, b) => (score.get(b.contentId) ?? 0) - (score.get(a.contentId) ?? 0))
    .slice(0, 6);
  const categories = placeCategories.map(category => ({
    category,
    count: summaries.filter(place => place.category === category).length
  }));

  return apiData({
    featured: summaries.slice(0, 3),
    popular,
    recent: summaries.slice(0, 4),
    categories
  }, {
    meta: { rankingWindowDays: 7, source: data.places[0]?.source ?? 'sample' },
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60' }
  });
}

import { NextRequest } from 'next/server';
import { apiData, apiError } from '@/backend/http';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';
import { getTourMvpData } from '@/backend/tour-mvp-data';
import { getMvpData } from '@/backend/data';
import { getTourPlaceDetail, getTourPlaceImages, getTourPlaceIntro } from '@/backend/tour-api';
import { placeToSummary, rowToPlaceDetail, stripProviderHtml, type DetailRow } from '@/backend/place-mapper';
import { isLang } from '@/shared/i18n';
import type { Lang, PlaceDetail } from '@/shared/types';

type RouteContext = { params: Promise<{ contentId: string }> };
type ProviderRow = Record<string, string | number | null | undefined>;

function field(row: ProviderRow, key: string): string {
  const value = row[key];
  return value === null || value === undefined ? '' : String(value);
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { contentId } = await params;
  const langParam = request.nextUrl.searchParams.get('lang');
  const lang: Lang = isLang(langParam) ? langParam : 'ko';
  if (!contentId.trim()) return apiError('INVALID_CONTENT_ID', 'contentId가 필요합니다.');

  // Built-in slug IDs are resolved locally before any provider call. Production
  // TourAPI content IDs are numeric, so this also keeps the offline sample path fast.
  if (!/^\d+$/.test(contentId)) {
    const sample = getMvpData(lang).places.find(place => place.contentId === contentId || place.id === contentId);
    if (sample) {
      return apiData({
        ...placeToSummary(sample),
        overview: sample.description,
        images: [sample.image]
      } satisfies PlaceDetail, {
        meta: { source: 'sample', fallback: true },
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800' }
      });
    }
  }

  const db = createSupabaseAdminClient();
  if (db) {
    const { data } = await db
      .from('places')
      .select('content_id, category, name, description, overview, address, phone, opening_hours, homepage_url, lat, lng, image_url, tags, source, updated_at, place_translations(lang, name, description, overview, opening_hours)')
      .eq('content_id', contentId)
      .maybeSingle();

    if (data) {
      const { data: placeId } = await db.from('places').select('id').eq('content_id', contentId).maybeSingle();
      let detail = rowToPlaceDetail(data as DetailRow, lang);
      if (placeId?.id) {
        const { data: ratings } = await db
          .from('community_posts')
          .select('rating')
          .eq('place_id', placeId.id)
          .eq('status', 'published')
          .not('rating', 'is', null)
          .limit(500);
        if (ratings?.length) {
          const average = ratings.reduce((sum, item) => sum + Number(item.rating), 0) / ratings.length;
          detail = {
            ...detail,
            rating: Math.round(average * 10) / 10,
            reviewSummary: `${ratings.length}개 후기 평균 ${average.toFixed(1)}점`
          };
        }
      }
      return apiData(detail, {
        meta: { source: 'database' },
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800' }
      });
    }
  }

  if (/^\d+$/.test(contentId)) {
    try {
      const [detailResult, imageResult] = await Promise.all([
        getTourPlaceDetail(contentId),
        getTourPlaceImages({ contentId, numOfRows: '20' }).catch(() => null)
      ]);
      const row = detailResult.items[0] as ProviderRow | undefined;
      if (row) {
        const contentTypeId = field(row, 'contenttypeid') || field(row, 'contentTypeId') || '12';
        const introResult = await getTourPlaceIntro(contentId, contentTypeId).catch(() => null);
        const intro = introResult?.items[0] as ProviderRow | undefined;
        const fallback = (await getTourMvpData(lang)).places.find(place => place.contentId === contentId);
        const mapY = Number(field(row, 'mapy'));
        const mapX = Number(field(row, 'mapx'));
        const images = (imageResult?.items ?? [])
          .map(image => field(image, 'originimgurl') || field(image, 'smallimageurl'))
          .filter(Boolean);
        const primaryImage = field(row, 'firstimage') || fallback?.image || '/login-spring-bg.png';
        const overview = stripProviderHtml(field(row, 'overview'));

        const item: PlaceDetail = {
          ...(fallback ? placeToSummary(fallback) : {
            contentId,
            category: 'attraction',
            name: field(row, 'title') || '경주 관광지',
            description: overview,
            address: [field(row, 'addr1'), field(row, 'addr2')].filter(Boolean).join(' '),
            imageUrl: primaryImage,
            coordinates: [
              Number.isFinite(mapY) ? mapY : 35.8562,
              Number.isFinite(mapX) ? mapX : 129.2247
            ],
            tags: [],
            source: 'tour-api'
          }),
          name: field(row, 'title') || fallback?.name || '경주 관광지',
          description: overview || fallback?.description || '',
          overview: overview || fallback?.description || '',
          address: [field(row, 'addr1'), field(row, 'addr2')].filter(Boolean).join(' ') || fallback?.address || '경주시',
          phone: field(row, 'tel') || undefined,
          openingHours: intro
            ? field(intro, 'usetime') ||
              field(intro, 'usetimeculture') ||
              field(intro, 'opentimefood') ||
              field(intro, 'checkintime') ||
              undefined
            : undefined,
          homepageUrl: stripProviderHtml(field(row, 'homepage')) || undefined,
          imageUrl: primaryImage,
          images: Array.from(new Set([primaryImage, ...images])),
          fetchedAt: new Date().toISOString()
        };

        return apiData(item, {
          meta: { source: 'tour-api' },
          headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800' }
        });
      }
    } catch {
      // The sample fallback below keeps the public route useful when TourAPI fails.
    }
  }

  const fallback = (await getTourMvpData(lang)).places.find(place => place.contentId === contentId || place.id === contentId);
  if (!fallback) return apiError('PLACE_NOT_FOUND', '관광지를 찾을 수 없습니다.', 404);

  return apiData({
    ...placeToSummary(fallback),
    overview: fallback.description,
    images: [fallback.image]
  } satisfies PlaceDetail, {
    meta: { source: 'sample', fallback: true },
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
  });
}

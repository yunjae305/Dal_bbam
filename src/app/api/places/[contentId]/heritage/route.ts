import { NextRequest } from 'next/server';
import { apiData, apiError } from '@/backend/http';
import { getMvpData } from '@/backend/data';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';
import { getTourPlaceDetail } from '@/backend/tour-api';
import { getHeritageByExactName } from '@/backend/heritage-api';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ contentId: string }> }) {
  const { contentId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(contentId)) return apiError('INVALID_PLACE', '올바른 관광지 ID가 필요합니다.');
  let name = getMvpData('ko').places.find(place => place.contentId === contentId || place.id === contentId)?.name;
  const db = createSupabaseAdminClient();
  if (!name && db) {
    const { data } = await db.from('places').select('name').eq('content_id', contentId).maybeSingle();
    if (data?.name) name = String(data.name);
  }
  if (!name && /^\d+$/.test(contentId)) {
    try {
      const detail = await getTourPlaceDetail(contentId);
      if (detail.items[0]?.title) name = String(detail.items[0].title);
    } catch { /* Optional heritage enrichment cannot block the place detail. */ }
  }
  const result = name ? await getHeritageByExactName(name) : { record: null, status: 'not-found' };
  return apiData(result.record, {
    meta: { source: 'korea-heritage-service', status: result.status },
    headers: { 'Cache-Control': result.status === 'matched'
      ? 'public, s-maxage=86400, stale-while-revalidate=86400' : 'public, s-maxage=60' }
  });
}

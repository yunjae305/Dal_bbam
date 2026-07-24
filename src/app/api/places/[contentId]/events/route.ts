import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/backend/auth/current-user';
import { apiData, apiError, isMutationAllowed } from '@/backend/http';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';

type RouteContext = { params: Promise<{ contentId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  if (!isMutationAllowed(request)) {
    return apiError('ORIGIN_REJECTED', '허용되지 않은 요청 출처입니다.', 403);
  }

  const { contentId } = await params;
  if (!contentId.trim()) return apiError('INVALID_CONTENT_ID', 'contentId가 필요합니다.');

  const db = createSupabaseAdminClient();
  if (!db) {
    return apiData({ recorded: false }, {
      status: 202,
      meta: { reason: 'database-unavailable' },
      headers: { 'Cache-Control': 'private, no-store' }
    });
  }

  const { data: place } = await db
    .from('places')
    .select('id')
    .eq('content_id', contentId)
    .maybeSingle();
  if (!place?.id) {
    return apiData({ recorded: false }, {
      status: 202,
      meta: { reason: 'place-not-synced' },
      headers: { 'Cache-Control': 'private, no-store' }
    });
  }

  const user = await getCurrentUser();
  const { error } = await db.from('place_events').insert({
    actor_key: user?.actorKey ?? null,
    place_id: place.id,
    event_type: 'view'
  });
  if (error) return apiError('PLACE_EVENT_FAILED', '조회 기록을 저장하지 못했습니다.', 500);

  return apiData({ recorded: true }, {
    status: 201,
    headers: { 'Cache-Control': 'private, no-store' }
  });
}

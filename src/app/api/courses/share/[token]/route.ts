import { NextRequest } from 'next/server';
import { apiData, apiError } from '@/backend/http';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/i.test(token)) return apiError('INVALID_SHARE_TOKEN', '유효하지 않은 공유 링크입니다.');
  const db = createSupabaseAdminClient();
  if (!db) return apiError('DATABASE_UNAVAILABLE', '데이터베이스가 설정되지 않았습니다.', 503);

  const { data, error } = await db
    .from('courses')
    .select('id, title, description, transport, created_at, course_places(order_index, reason, stay_minutes, places(content_id, category, name, description, address, lat, lng, image_url, tags))')
    .eq('share_token', token)
    .maybeSingle();
  if (error) return apiError('SHARED_COURSE_READ_FAILED', error.message, 500);
  if (!data) return apiError('SHARED_COURSE_NOT_FOUND', '공유 코스를 찾을 수 없습니다.', 404);
  return apiData(data, { headers: { 'Cache-Control': 'public, s-maxage=60' } });
}

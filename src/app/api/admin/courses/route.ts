import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { authorizeAdminRequest } from '@/backend/auth/admin';
import { apiData, apiError, isMutationAllowed, isUuid, parseBody, resolvePlaceId } from '@/backend/http';
import { parseCuratedCourse } from '@/backend/curated-courses';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';

const privateHeaders = { 'Cache-Control': 'private, no-store' };

async function adminContext(request: NextRequest): Promise<
  { db: NonNullable<ReturnType<typeof createSupabaseAdminClient>> } | { response: ReturnType<typeof apiError> }
> {
  if (request.method !== 'GET' && !isMutationAllowed(request)) return { response: apiError('ORIGIN_REJECTED', '허용되지 않은 요청 출처입니다.', 403) };
  const auth = await authorizeAdminRequest(request);
  if (!auth.authorized) return { response: apiError('ADMIN_UNAUTHORIZED', '관리자 인증이 필요합니다.', 401) };
  const db = createSupabaseAdminClient();
  if (!db) return { response: apiError('DATABASE_UNAVAILABLE', '데이터베이스가 설정되지 않았습니다.', 503) };
  return { db };
}

export async function GET(request: NextRequest) {
  const context = await adminContext(request);
  if ('response' in context) return context.response;
  const { data, error } = await context.db.from('courses')
    .select('*, course_places(order_index, reason, stay_minutes, places(content_id, name))')
    .eq('is_curated', true).order('created_at', { ascending: false }).limit(200);
  if (error) return apiError('COURSES_READ_FAILED', error.message, 500);
  return apiData(data ?? [], { headers: privateHeaders });
}

async function save(request: NextRequest, editing: boolean) {
  const context = await adminContext(request);
  if ('response' in context) return context.response;
  const body = parseCuratedCourse(await parseBody<unknown>(request), editing);
  if (!body) return apiError('INVALID_CURATED_COURSE', '제목, 테마와 1~20개의 방문 장소를 확인해 주세요.', 422);
  const placeIds = await Promise.all(body.stops.map(stop => resolvePlaceId(context.db, stop.contentId)));
  if (placeIds.some(id => !id)) return apiError('PLACE_NOT_FOUND', '코스에 존재하지 않는 관광지가 있습니다.', 422);
  const { data, error } = await context.db.rpc('save_curated_course', {
    p_id: editing ? body.id : null,
    p_title: body.title, p_description: body.description, p_transport: body.transport, p_theme: body.theme,
    p_share_token: randomUUID().replaceAll('-', ''),
    p_items: body.stops.map((stop, index) => ({ place_id: placeIds[index], order_index: index, reason: stop.reason, stay_minutes: stop.stayMinutes }))
  });
  if (error?.message.includes('course_not_found')) return apiError('COURSE_NOT_FOUND', '코스를 찾을 수 없습니다.', 404);
  if (error) return apiError('COURSE_SAVE_FAILED', error.message, 500);
  return apiData(data, { status: editing ? 200 : 201, headers: privateHeaders });
}

export async function POST(request: NextRequest) { return save(request, false); }
export async function PATCH(request: NextRequest) { return save(request, true); }

export async function DELETE(request: NextRequest) {
  const context = await adminContext(request);
  if ('response' in context) return context.response;
  const id = request.nextUrl.searchParams.get('id');
  if (!isUuid(id)) return apiError('INVALID_COURSE_ID', '유효한 코스 ID가 필요합니다.');
  const { data, error } = await context.db.from('courses').delete().eq('id', id).eq('is_curated', true).select('id').maybeSingle();
  if (error) return apiError('COURSE_DELETE_FAILED', error.message, 500);
  if (!data) return apiError('COURSE_NOT_FOUND', '코스를 찾을 수 없습니다.', 404);
  return apiData({ deleted: true }, { headers: privateHeaders });
}

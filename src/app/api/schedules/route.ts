import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { apiData, apiError, getUserDataContext, isErrorContext, parseBody, resolvePlaceId } from '@/backend/http';
import { duplicateScheduleItems, isScheduleDate as isDate, isScheduleItem, type ScheduleWriteItem } from '@/backend/schedules';

type ScheduleBody = {
  title?: string;
  startDate?: string;
  endDate?: string;
  items?: ScheduleWriteItem[];
};

export async function GET(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;

  const { data, error } = await context.db
    .from('schedules')
    .select('*, schedule_places(id, visit_date, start_time, stay_minutes, sort_order, note, places(id, content_id, category, name, description, address, lat, lng, image_url, tags))')
    .eq('actor_key', context.user.actorKey)
    .order('created_at', { ascending: false });

  if (error) return apiError('SCHEDULES_READ_FAILED', error.message, 500);
  return apiData(data ?? [], { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;

  const body = await parseBody<ScheduleBody>(request);
  if (!body || typeof body !== 'object') return apiError('INVALID_SCHEDULE', '올바른 제목과 시작일·종료일이 필요합니다.');
  const startDate = typeof body.startDate === 'string' ? body.startDate : undefined;
  const endDate = body.endDate === undefined ? startDate : typeof body.endDate === 'string' ? body.endDate : undefined;
  if (
    typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 80 ||
    !isDate(startDate) || !isDate(endDate) || endDate < startDate
  ) {
    return apiError('INVALID_SCHEDULE', '올바른 제목과 시작일·종료일이 필요합니다.');
  }

  if (body.items !== undefined) {
    if (!Array.isArray(body.items) || body.items.length > 100 || body.items.some(item => !isScheduleItem(item, startDate, endDate))) {
      return apiError('INVALID_SCHEDULE_ITEM', '방문일·시간 또는 체류시간이 일정 범위와 맞지 않습니다.');
    }
    if (duplicateScheduleItems(body.items)) return apiError('DUPLICATE_SCHEDULE_PLACE', '같은 날짜에 같은 장소를 중복 추가할 수 없습니다.');
    const resolved = await Promise.all(body.items.map(item => resolvePlaceId(context.db, item.contentId.trim())));
    if (resolved.some(id => !id)) return apiError('PLACE_NOT_FOUND', '일정에 존재하지 않는 관광지가 있습니다.', 422);
    const { data, error } = await context.db.rpc('create_schedule_with_places', {
      p_actor_key: context.user.actorKey,
      p_user_id: context.user.supabaseUserId ?? null,
      p_title: body.title.trim(), p_start_date: startDate, p_end_date: endDate,
      p_share_token: randomUUID().replaceAll('-', ''),
      p_items: body.items.map((item, index) => ({
        place_id: resolved[index], visit_date: item.visitDate, start_time: item.startTime ?? null,
        stay_minutes: item.stayMinutes ?? 60, sort_order: index, note: item.note?.slice(0, 500) ?? null
      }))
    });
    if (error) return apiError('SCHEDULE_SAVE_FAILED', error.message, 500);
    return apiData(data, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  }

  const { data, error } = await context.db
    .from('schedules')
    .insert({
      actor_key: context.user.actorKey,
      user_id: context.user.supabaseUserId ?? null,
      title: body.title.trim(),
      start_date: startDate,
      end_date: endDate,
      share_token: randomUUID().replaceAll('-', '')
    })
    .select()
    .single();

  if (error) return apiError('SCHEDULE_SAVE_FAILED', error.message, 500);
  return apiData(data, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}

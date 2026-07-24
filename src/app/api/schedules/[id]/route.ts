import { NextRequest } from 'next/server';
import {
  apiData,
  apiError,
  getUserDataContext,
  isErrorContext,
  parseBody,
  resolvePlaceId
} from '@/backend/http';

type RouteContext = { params: Promise<{ id: string }> };
type SchedulePatch = {
  title?: string;
  startDate?: string;
  endDate?: string;
  items?: Array<{
    contentId: string;
    visitDate: string;
    startTime?: string;
    stayMinutes?: number;
    note?: string;
  }>;
};

function isDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const { id } = await params;

  const { data, error } = await context.db
    .from('schedules')
    .select('*, schedule_places(id, visit_date, start_time, stay_minutes, sort_order, note, places(id, content_id, category, name, description, address, lat, lng, image_url, tags))')
    .eq('id', id)
    .eq('actor_key', context.user.actorKey)
    .maybeSingle();

  if (error) return apiError('SCHEDULE_READ_FAILED', error.message, 500);
  if (!data) return apiError('SCHEDULE_NOT_FOUND', '일정을 찾을 수 없습니다.', 404);
  return apiData(data, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const { id } = await params;
  const body = await parseBody<SchedulePatch>(request);
  if (!body) return apiError('INVALID_BODY', '올바른 JSON 요청이 필요합니다.');

  const { data: owned } = await context.db
    .from('schedules')
    .select('id, start_date, end_date')
    .eq('id', id)
    .eq('actor_key', context.user.actorKey)
    .maybeSingle();
  if (!owned) return apiError('SCHEDULE_NOT_FOUND', '일정을 찾을 수 없습니다.', 404);
  if (body.title !== undefined && (!body.title.trim() || body.title.trim().length > 80)) {
    return apiError('INVALID_SCHEDULE_TITLE', '일정 제목은 1~80자로 입력해 주세요.');
  }
  if (body.startDate !== undefined && !isDate(body.startDate)) {
    return apiError('INVALID_START_DATE', '올바른 시작일이 필요합니다.');
  }
  if (body.endDate !== undefined && !isDate(body.endDate)) {
    return apiError('INVALID_END_DATE', '올바른 종료일이 필요합니다.');
  }
  const effectiveStartDate = body.startDate ?? String(owned.start_date);
  const effectiveEndDate = body.endDate ?? String(owned.end_date);
  if (effectiveEndDate < effectiveStartDate) {
    return apiError('INVALID_DATE_RANGE', '종료일은 시작일보다 빠를 수 없습니다.');
  }
  if (body.items !== undefined && !Array.isArray(body.items)) {
    return apiError('INVALID_SCHEDULE_ITEMS', '일정 장소 목록 형식이 올바르지 않습니다.');
  }
  if (body.items && body.items.length > 100) {
    return apiError('TOO_MANY_SCHEDULE_ITEMS', '일정에는 최대 100곳까지 추가할 수 있습니다.');
  }
  if (body.items?.some(item =>
    !item ||
    typeof item.contentId !== 'string' ||
    !item.contentId.trim() ||
    !isDate(item.visitDate) ||
    item.visitDate < effectiveStartDate ||
    item.visitDate > effectiveEndDate ||
    (item.startTime !== undefined && !/^\d{2}:\d{2}(?::\d{2})?$/.test(item.startTime)) ||
    (item.stayMinutes !== undefined && !Number.isFinite(item.stayMinutes))
  )) {
    return apiError('INVALID_SCHEDULE_ITEM', '방문일·시간 또는 체류시간이 일정 범위와 맞지 않습니다.');
  }
  const contentIds = body.items?.map(item => item.contentId.trim()) ?? [];
  if (new Set(contentIds).size !== contentIds.length) {
    return apiError('DUPLICATE_SCHEDULE_PLACE', '같은 장소는 일정에 한 번만 추가할 수 있습니다.');
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) patch.title = body.title.trim();
  if (body.startDate) patch.start_date = body.startDate;
  if (body.endDate) patch.end_date = body.endDate;

  const { error: updateError } = await context.db
    .from('schedules')
    .update(patch)
    .eq('id', id)
    .eq('actor_key', context.user.actorKey);
  if (updateError) return apiError('SCHEDULE_UPDATE_FAILED', updateError.message, 500);

  if (body.items) {
    const resolved = await Promise.all(body.items.map(item => resolvePlaceId(context.db, item.contentId)));
    if (resolved.some(placeId => !placeId)) {
      return apiError('PLACE_NOT_FOUND', '일정에 존재하지 않는 관광지가 있습니다.', 422);
    }

    const rows = body.items.map((item, index) => ({
      schedule_id: id,
      place_id: resolved[index] as string,
      visit_date: item.visitDate,
      start_time: item.startTime ?? null,
      stay_minutes: Math.min(240, Math.max(15, item.stayMinutes ?? 60)),
      sort_order: index,
      note: item.note?.slice(0, 500) ?? null
    }));

    const { error: replaceError } = await context.db.rpc('replace_schedule_places', {
      p_schedule_id: id,
      p_actor_key: context.user.actorKey,
      p_items: rows
    });
    if (replaceError) return apiError('SCHEDULE_ITEMS_REORDER_FAILED', replaceError.message, 500);
  }

  const { data, error } = await context.db
    .from('schedules')
    .select('*, schedule_places(*, places(*))')
    .eq('id', id)
    .eq('actor_key', context.user.actorKey)
    .single();
  if (error) return apiError('SCHEDULE_READ_FAILED', error.message, 500);
  return apiData(data, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const { id } = await params;

  const { data, error } = await context.db
    .from('schedules')
    .delete()
    .eq('id', id)
    .eq('actor_key', context.user.actorKey)
    .select('id')
    .maybeSingle();

  if (error) return apiError('SCHEDULE_DELETE_FAILED', error.message, 500);
  if (!data) return apiError('SCHEDULE_NOT_FOUND', '일정을 찾을 수 없습니다.', 404);
  return apiData({ deleted: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}

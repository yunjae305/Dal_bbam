import { NextRequest } from 'next/server';
import {
  apiData,
  apiError,
  getUserDataContext,
  isErrorContext,
  isUuid,
  parseBody,
  resolvePlaceId
} from '@/backend/http';

type RouteContext = { params: Promise<{ id: string }> };
type ScheduleItem = {
  contentId: string;
  visitDate: string;
  startTime?: string;
  stayMinutes?: number;
  note?: string;
};
type SchedulePatch = {
  title?: string;
  startDate?: string;
  endDate?: string;
  items?: ScheduleItem[];
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const notFound = () => apiError('SCHEDULE_NOT_FOUND', '일정을 찾을 수 없습니다.', 404);

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidItem(item: unknown, startDate: string, endDate: string): item is ScheduleItem {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Partial<ScheduleItem>;
  return typeof candidate.contentId === 'string' &&
    Boolean(candidate.contentId.trim()) &&
    isDate(candidate.visitDate) &&
    candidate.visitDate >= startDate &&
    candidate.visitDate <= endDate &&
    (candidate.startTime === undefined || (typeof candidate.startTime === 'string' && TIME_PATTERN.test(candidate.startTime))) &&
    (candidate.stayMinutes === undefined || Number.isInteger(candidate.stayMinutes)) &&
    (candidate.note === undefined || candidate.note === null || typeof candidate.note === 'string');
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const { data, error } = await context.db
    .from('schedules')
    .select('*, schedule_places(id, visit_date, start_time, stay_minutes, sort_order, note, places(id, content_id, category, name, description, address, lat, lng, image_url, tags))')
    .eq('id', id)
    .eq('actor_key', context.user.actorKey)
    .maybeSingle();

  if (error) return apiError('SCHEDULE_READ_FAILED', error.message, 500);
  if (!data) return notFound();
  return apiData(data, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const body = await parseBody<SchedulePatch>(request);
  if (!body || typeof body !== 'object') return apiError('INVALID_BODY', '올바른 JSON 요청이 필요합니다.');

  const { data: owned } = await context.db
    .from('schedules')
    .select('id, start_date, end_date')
    .eq('id', id)
    .eq('actor_key', context.user.actorKey)
    .maybeSingle();
  if (!owned) return notFound();
  if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 80)) {
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
  if (body.items?.some(item => !isValidItem(item, effectiveStartDate, effectiveEndDate))) {
    return apiError('INVALID_SCHEDULE_ITEM', '방문일·시간 또는 체류시간이 일정 범위와 맞지 않습니다.');
  }
  const items = (body.items ?? []).map(item => ({ ...item, contentId: item.contentId.trim() }));
  const contentIds = items.map(item => item.contentId);
  if (new Set(contentIds).size !== contentIds.length) {
    return apiError('DUPLICATE_SCHEDULE_PLACE', '같은 장소는 일정에 한 번만 추가할 수 있습니다.');
  }

  const datesChanged = (body.startDate !== undefined && body.startDate !== String(owned.start_date)) ||
    (body.endDate !== undefined && body.endDate !== String(owned.end_date));

  // Resolve every place and validate the existing rows against the new date range
  // BEFORE touching the schedule header so a bad request never leaves a partial write.
  let rows: Array<Record<string, unknown>> | null = null;
  if (body.items) {
    const resolved = await Promise.all(items.map(item => resolvePlaceId(context.db, item.contentId)));
    if (resolved.some(placeId => !placeId)) {
      return apiError('PLACE_NOT_FOUND', '일정에 존재하지 않는 관광지가 있습니다.', 422);
    }
    rows = items.map((item, index) => ({
      schedule_id: id,
      place_id: resolved[index] as string,
      visit_date: item.visitDate,
      start_time: item.startTime ?? null,
      stay_minutes: Math.min(240, Math.max(15, item.stayMinutes ?? 60)),
      sort_order: index,
      note: item.note?.slice(0, 500) ?? null
    }));
  } else if (datesChanged) {
    const { data: existing, error: existingError } = await context.db
      .from('schedule_places')
      .select('visit_date')
      .eq('schedule_id', id);
    if (existingError) return apiError('SCHEDULE_READ_FAILED', existingError.message, 500);
    const outOfRange = (existing ?? []).some(row => {
      const visitDate = String(row.visit_date);
      return visitDate < effectiveStartDate || visitDate > effectiveEndDate;
    });
    if (outOfRange) {
      return apiError('INVALID_DATE_RANGE', '새 일정 기간을 벗어나는 방문 장소가 있습니다. 장소 목록을 함께 수정해 주세요.');
    }
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

  if (rows) {
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
  if (!isUuid(id)) return notFound();

  const { data, error } = await context.db
    .from('schedules')
    .delete()
    .eq('id', id)
    .eq('actor_key', context.user.actorKey)
    .select('id')
    .maybeSingle();

  if (error) return apiError('SCHEDULE_DELETE_FAILED', error.message, 500);
  if (!data) return notFound();
  return apiData({ deleted: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}

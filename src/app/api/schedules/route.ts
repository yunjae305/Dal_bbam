import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { apiData, apiError, getUserDataContext, isErrorContext, parseBody } from '@/backend/http';

type ScheduleBody = {
  title?: string;
  startDate?: string;
  endDate?: string;
};

function isDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

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

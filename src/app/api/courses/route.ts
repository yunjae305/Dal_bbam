import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import {
  apiData,
  apiError,
  getUserDataContext,
  isErrorContext,
  parseBody,
  resolvePlaceId
} from '@/backend/http';
import type { TransportMode } from '@/shared/types';

type CourseBody = {
  title?: string;
  description?: string;
  isAiGenerated?: boolean;
  transport?: TransportMode;
  contentIds?: string[];
  reasons?: string[];
  stayMinutes?: number[];
};

export async function GET(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;

  const { data, error } = await context.db
    .from('courses')
    .select('*, course_places(order_index, reason, stay_minutes, places(id, content_id, category, name, description, address, lat, lng, image_url, tags))')
    .or(`actor_key.eq.${context.user.actorKey},is_curated.eq.true`)
    .order('created_at', { ascending: false });

  if (error) return apiError('COURSES_READ_FAILED', error.message, 500);
  return apiData(data ?? [], { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;

  const body = await parseBody<CourseBody>(request);
  if (!body?.title?.trim()) return apiError('INVALID_TITLE', 'title이 필요합니다.');

  const contentIds = (body.contentIds ?? []).slice(0, 20);
  const resolved = await Promise.all(contentIds.map(id => resolvePlaceId(context.db, id)));
  if (contentIds.length && resolved.some(id => !id)) {
    return apiError('PLACE_NOT_FOUND', '저장할 코스에 존재하지 않는 관광지가 있습니다.', 422);
  }

  const { data: course, error: courseError } = await context.db
    .from('courses')
    .insert({
      actor_key: context.user.actorKey,
      user_id: context.user.supabaseUserId ?? null,
      title: body.title.trim(),
      description: body.description?.trim() ?? '',
      is_ai_generated: body.isAiGenerated ?? false,
      transport: body.transport ?? 'walking',
      share_token: randomUUID().replaceAll('-', '')
    })
    .select()
    .single();

  if (courseError || !course) {
    return apiError('COURSE_SAVE_FAILED', courseError?.message ?? '코스를 저장할 수 없습니다.', 500);
  }

  if (resolved.length) {
    const rows = resolved.map((placeId, index) => ({
      course_id: course.id,
      place_id: placeId as string,
      order_no: index,
      order_index: index,
      reason: body.reasons?.[index] ?? null,
      stay_minutes: Math.min(240, Math.max(15, body.stayMinutes?.[index] ?? 60))
    }));
    const { error } = await context.db.from('course_places').insert(rows);
    if (error) {
      await context.db.from('courses').delete().eq('id', course.id).eq('actor_key', context.user.actorKey);
      return apiError('COURSE_STOPS_SAVE_FAILED', error.message, 500);
    }
  }

  return apiData(course, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}

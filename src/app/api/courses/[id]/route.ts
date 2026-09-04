import { NextRequest } from 'next/server';
import { apiData, apiError, getUserDataContext, isErrorContext, isUuid, parseBody } from '@/backend/http';

type RouteContext = { params: Promise<{ id: string }> };
type CoursePatch = { title?: string; description?: string };

const notFound = () => apiError('COURSE_NOT_FOUND', '코스를 찾을 수 없습니다.', 404);

export async function GET(request: NextRequest, { params }: RouteContext) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const { data, error } = await context.db
    .from('courses')
    .select('*, course_places(order_index, reason, stay_minutes, places(*))')
    .eq('id', id)
    .or(`actor_key.eq.${context.user.actorKey},is_curated.eq.true`)
    .maybeSingle();

  if (error) return apiError('COURSE_READ_FAILED', error.message, 500);
  if (!data) return apiError('COURSE_NOT_FOUND', '코스를 찾을 수 없습니다.', 404);
  return apiData(data, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const body = await parseBody<CoursePatch>(request);
  if (!body || typeof body !== 'object') return apiError('INVALID_BODY', '올바른 JSON 요청이 필요합니다.');

  const patch: CoursePatch & { updated_at: string } = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 80) {
      return apiError('INVALID_TITLE', '코스 제목은 1~80자로 입력해 주세요.');
    }
    patch.title = body.title.trim();
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string') return apiError('INVALID_BODY', '코스 설명 형식이 올바르지 않습니다.');
    patch.description = body.description.trim().slice(0, 2000);
  }

  const { data, error } = await context.db
    .from('courses')
    .update(patch)
    .eq('id', id)
    .eq('actor_key', context.user.actorKey)
    .select()
    .maybeSingle();

  if (error) return apiError('COURSE_UPDATE_FAILED', error.message, 500);
  if (!data) return apiError('COURSE_NOT_FOUND', '코스를 찾을 수 없습니다.', 404);
  return apiData(data, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const { data, error } = await context.db
    .from('courses')
    .delete()
    .eq('id', id)
    .eq('actor_key', context.user.actorKey)
    .select('id')
    .maybeSingle();

  if (error) return apiError('COURSE_DELETE_FAILED', error.message, 500);
  if (!data) return apiError('COURSE_NOT_FOUND', '코스를 찾을 수 없습니다.', 404);
  return apiData({ deleted: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}

import { NextRequest } from 'next/server';
import {
  adminRateLimitActor,
  adminShortInsertColumns,
  adminShortRowSelect,
  adminShortUpdateColumns,
  mapAdminShortRow,
  validateAdminShortCreate,
  validateAdminShortMedia,
  validateAdminShortPatch
} from '@/backend/shorts-admin';
import { authorizeAdminRequest } from '@/backend/auth/admin';
import { apiData, apiError as responseError, isMutationAllowed, resolvePlaceId } from '@/backend/http';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';
import { isLang } from '@/shared/i18n';
import type { AdminShortPageMeta } from '@/shared/admin-shorts';

const MAX_BODY_BYTES = 64 * 1024;
const REQUESTS_PER_MINUTE = 30;

function apiError(...parameters: Parameters<typeof responseError>) {
  const response = responseError(...parameters);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
type AdminContext = { db: NonNullable<ReturnType<typeof createSupabaseAdminClient>> };
type AdminContextResult = AdminContext | { response: ReturnType<typeof apiError> };
type AdminBodyResult = { value: unknown } | { response: ReturnType<typeof apiError> };

async function readAdminJson(request: NextRequest): Promise<AdminBodyResult> {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return { response: apiError('BODY_TOO_LARGE', '요청 본문은 64KB 이하여야 합니다.', 413) };
  }
  try {
    return { value: JSON.parse(body) as unknown };
  } catch {
    return { response: apiError('INVALID_JSON', '올바른 JSON 요청 본문이 필요합니다.', 400) };
  }
}

async function getAdminContext(request: NextRequest): Promise<AdminContextResult> {
  if (request.method !== 'GET' && !isMutationAllowed(request)) {
    return { response: apiError('ORIGIN_REJECTED', '허용되지 않은 요청 출처입니다.', 403) };
  }

  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) {
    const response = apiError('ADMIN_UNAUTHORIZED', '유효한 관리자 인증이 필요합니다.', 401);
    response.headers.set('WWW-Authenticate', 'Bearer realm="shorts-admin"');
    return { response };
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isFinite(contentLength) || contentLength > MAX_BODY_BYTES) {
    return { response: apiError('BODY_TOO_LARGE', '요청 본문은 64KB 이하여야 합니다.', 413) };
  }

  const db = createSupabaseAdminClient();
  if (!db) return { response: apiError('DATABASE_UNAVAILABLE', '데이터베이스가 설정되지 않았습니다.', 503) };

  const windowStart = new Date();
  windowStart.setSeconds(0, 0);
  const { data, error } = await db.rpc('consume_api_rate_limit', {
    p_actor_key: authorization.user?.actorKey ?? adminRateLimitActor(
      request.headers.get('x-forwarded-for'),
      request.headers.get('x-real-ip')
    ),
    p_scope: 'admin:shorts',
    p_window_started_at: windowStart.toISOString(),
    p_limit: REQUESTS_PER_MINUTE
  });
  if (error) {
    console.error('[admin-shorts] rate limit check failed', error.message);
    return { response: apiError('RATE_LIMIT_UNAVAILABLE', '요청 한도를 확인할 수 없습니다.', 503) };
  }
  if (data !== true) {
    const response = apiError('RATE_LIMITED', '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429);
    response.headers.set('Retry-After', '60');
    return { response };
  }

  return { db };
}

export async function GET(request: NextRequest) {
  const context = await getAdminContext(request);
  if ('response' in context) return context.response;
  const params = request.nextUrl.searchParams;
  const limit = Number(params.get('limit') ?? 20);
  const offset = Number(params.get('offset') ?? 0);
  const lang = params.get('lang');
  const status = params.get('status') ?? 'all';
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 ||
      !Number.isInteger(offset) || offset < 0 || offset > 100000 ||
      (lang !== null && !isLang(lang)) || !['all', 'published', 'draft'].includes(status)) {
    return apiError('INVALID_SHORTS_QUERY', '올바른 언어, 공개 상태와 조회 범위를 입력해 주세요.');
  }
  let query = context.db.from('shorts').select(adminShortRowSelect);
  if (lang) query = query.eq('lang', lang);
  if (status !== 'all') query = query.eq('is_published', status === 'published');
  const { data, error } = await query.order('updated_at', { ascending: false })
    .order('id', { ascending: false }).range(offset, offset + limit);
  if (error) return apiError('SHORT_LIST_FAILED', '쇼츠 목록을 불러오지 못했습니다.', 503);
  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const meta: AdminShortPageMeta = { limit, offset, hasMore, nextOffset: hasMore ? offset + limit : null };
  return apiData(rows.slice(0, limit).map(row => mapAdminShortRow(row as unknown as Record<string, unknown>)), {
    meta, headers: { 'Cache-Control': 'private, no-store' }
  });
}

export async function POST(request: NextRequest) {
  const context = await getAdminContext(request);
  if ('response' in context) return context.response;

  const body = await readAdminJson(request);
  if ('response' in body) return body.response;
  const parsed = validateAdminShortCreate(body.value);
  if (!parsed.ok) return apiError('INVALID_SHORT', parsed.message, 422);
  const placeId = await resolvePlaceId(context.db, parsed.value.contentId);
  if (!placeId) return apiError('PLACE_NOT_FOUND', '연결할 관광지를 찾을 수 없습니다.', 404);

  const { data, error } = await context.db
    .from('shorts')
    .insert(adminShortInsertColumns(parsed.value, placeId))
    .select(adminShortRowSelect)
    .single();
  if (error || !data) return apiError('SHORT_SAVE_FAILED', error?.message ?? '쇼츠를 저장하지 못했습니다.', 500);

  return apiData(mapAdminShortRow(data as unknown as Record<string, unknown>), {
    status: 201,
    headers: { 'Cache-Control': 'private, no-store' }
  });
}

export async function PATCH(request: NextRequest) {
  const context = await getAdminContext(request);
  if ('response' in context) return context.response;

  const body = await readAdminJson(request);
  if ('response' in body) return body.response;
  const parsed = validateAdminShortPatch(body.value);
  if (!parsed.ok) return apiError('INVALID_SHORT', parsed.message, 422);
  const { data: current, error: currentError } = await context.db.from('shorts').select(adminShortRowSelect)
    .eq('id', parsed.value.shortId).maybeSingle();
  if (currentError) return apiError('SHORT_LOAD_FAILED', '수정할 쇼츠를 불러오지 못했습니다.', 503);
  if (!current) return apiError('SHORT_NOT_FOUND', '수정할 쇼츠를 찾을 수 없습니다.', 404);
  const placeId = parsed.value.contentId
    ? await resolvePlaceId(context.db, parsed.value.contentId)
    : undefined;
  if (parsed.value.contentId && !placeId) {
    return apiError('PLACE_NOT_FOUND', '연결할 관광지를 찾을 수 없습니다.', 404);
  }

  const columns = adminShortUpdateColumns(parsed.value, placeId ?? undefined);
  const existing = current as unknown as Record<string, unknown>;
  const previousUpdate = Date.parse(String(existing.updated_at ?? ''));
  if (Number.isFinite(previousUpdate)) {
    columns.updated_at = new Date(Math.max(Date.now(), previousUpdate + 1)).toISOString();
  }
  const merged = mapAdminShortRow({ ...existing, ...columns });
  if (merged.isPublished) {
    const media = validateAdminShortMedia(merged);
    if (!media.ok) return apiError('INVALID_SHORT', media.message, 422);
  }
  let update = context.db
    .from('shorts')
    .update(columns)
    .eq('id', parsed.value.shortId);
  // The validated media combination must still be the row being updated.
  update = existing.updated_at === null
    ? update.is('updated_at', null)
    : update.eq('updated_at', String(existing.updated_at));
  const { data, error } = await update.select(adminShortRowSelect)
    .maybeSingle();
  if (error) return apiError('SHORT_UPDATE_FAILED', error.message, 500);
  if (!data) return apiError('SHORT_EDIT_CONFLICT', '다른 변경이 저장됐습니다. 목록을 새로 불러온 후 다시 수정해 주세요.', 409);

  return apiData(mapAdminShortRow(data as unknown as Record<string, unknown>), {
    headers: { 'Cache-Control': 'private, no-store' }
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, type CurrentUser } from '@/backend/auth/current-user';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';
import type { ApiFailure, ApiSuccess } from '@/shared/types';

export function apiData<T>(
  data: T,
  options?: { status?: number; meta?: Record<string, unknown>; headers?: HeadersInit }
) {
  const body: ApiSuccess<T> = options?.meta ? { data, meta: options.meta } : { data };
  return NextResponse.json(body, {
    status: options?.status ?? 200,
    headers: options?.headers
  });
}

const DATABASE_UNREACHABLE_MESSAGE = '데이터 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.';

export function apiError(
  code: string,
  message: string,
  status = 400,
  details?: unknown
) {
  // Routes often forward a raw Supabase/PostgREST message on 500. When that
  // message is really a connection failure, answer 503 with a stable text and
  // keep the raw detail in the server log only.
  if (status >= 500 && isConnectionFailure({ message })) {
    console.error(`[api] ${code} database unreachable: ${message}`);
    message = DATABASE_UNREACHABLE_MESSAGE;
    status = 503;
  }
  const body: ApiFailure = {
    error: details === undefined ? { code, message } : { code, message, details }
  };
  return NextResponse.json(body, { status });
}

export async function parseBody<T>(request: NextRequest): Promise<T | null> {
  try {
    return await request.json() as T;
  } catch {
    return null;
  }
}

export function isMutationAllowed(request: NextRequest): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site') return false;
  if (site === 'same-origin') return true;

  const origin = request.headers.get('origin');
  if (!origin) return true;

  // nextUrl reflects the server's bind address (e.g. 0.0.0.0 in dev, an
  // internal host behind a proxy), so compare against the request Host first.
  const requestHost =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    request.headers.get('host');

  try {
    const originUrl = new URL(origin);
    return originUrl.host === requestHost || originUrl.origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export type UserDataContext = {
  user: CurrentUser;
  db: NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
};

export async function getUserDataContext(
  request?: NextRequest
): Promise<UserDataContext | { response: NextResponse }> {
  if (request && request.method !== 'GET' && !isMutationAllowed(request)) {
    return { response: apiError('ORIGIN_REJECTED', '허용되지 않은 요청 출처입니다.', 403) };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { response: apiError('UNAUTHENTICATED', '로그인이 필요합니다.', 401) };
  }

  const db = createSupabaseAdminClient();
  if (!db) {
    return { response: apiError('DATABASE_UNAVAILABLE', '데이터베이스가 설정되지 않았습니다.', 503) };
  }

  return { user, db };
}

export function isErrorContext(
  context: UserDataContext | { response: NextResponse }
): context is { response: NextResponse } {
  return 'response' in context;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Supabase-js surfaces transport failures (e.g. `TypeError: fetch failed`) as
 * ordinary PostgrestError objects; detect them so callers can answer 503
 * with a stable message instead of leaking the raw text.
 */
export function isConnectionFailure(error: { message?: string } | null | undefined): boolean {
  const message = error?.message ?? '';
  return /fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network/i.test(message);
}

export type RateLimitResult = 'ok' | 'limited' | 'error';

export async function checkRateLimit(
  context: UserDataContext,
  scope: string,
  limit: number
): Promise<RateLimitResult> {
  const now = new Date();
  now.setSeconds(0, 0);
  const windowStartedAt = now.toISOString();
  const { data, error } = await context.db.rpc('consume_api_rate_limit', {
    p_actor_key: context.user.actorKey,
    p_scope: scope,
    p_window_started_at: windowStartedAt,
    p_limit: limit
  });

  if (error) {
    // The atomic quota lives in Postgres; when the database is unreachable
    // fall back to a per-instance in-memory window so features that do not
    // need the database (narration templates, rule-based courses) keep working.
    if (isConnectionFailure(error)) {
      console.error('[rate-limit] database unreachable, using in-memory quota', error.message);
      return consumeLocalRateLimit(`${context.user.actorKey}:${scope}`, limit, now.getTime());
    }
    console.error('[rate-limit] atomic quota check failed', error.message);
    return 'error';
  }
  return data === true ? 'ok' : 'limited';
}

const localRateBuckets = new Map<string, { windowStart: number; count: number }>();

function consumeLocalRateLimit(key: string, limit: number, windowStart: number): RateLimitResult {
  const bucket = localRateBuckets.get(key);
  if (!bucket || bucket.windowStart !== windowStart) {
    localRateBuckets.set(key, { windowStart, count: 1 });
    if (localRateBuckets.size > 5_000) {
      for (const [bucketKey, entry] of localRateBuckets) {
        if (entry.windowStart !== windowStart) localRateBuckets.delete(bucketKey);
      }
    }
    return 'ok';
  }
  if (bucket.count >= limit) return 'limited';
  bucket.count += 1;
  return 'ok';
}

export function rateLimitError(result: Exclude<RateLimitResult, 'ok'>, limitedMessage: string) {
  if (result === 'error') {
    return apiError('RATE_LIMIT_UNAVAILABLE', '요청 한도를 확인할 수 없습니다.', 503);
  }
  return apiError('RATE_LIMITED', limitedMessage, 429);
}

export async function resolvePlaceId(
  db: UserDataContext['db'],
  contentIdOrUuid: string
): Promise<string | null> {
  const byContentId = await db
    .from('places')
    .select('id')
    .eq('content_id', contentIdOrUuid)
    .maybeSingle();

  if (byContentId.data?.id) return String(byContentId.data.id);

  const byId = await db
    .from('places')
    .select('id')
    .eq('id', contentIdOrUuid)
    .maybeSingle();

  return byId.data?.id ? String(byId.data.id) : null;
}

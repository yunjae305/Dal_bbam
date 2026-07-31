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

export function apiError(
  code: string,
  message: string,
  status = 400,
  details?: unknown
) {
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

export async function checkRateLimit(
  context: UserDataContext,
  scope: string,
  limit: number
): Promise<boolean> {
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
    console.error('[rate-limit] atomic quota check failed', error.message);
    return false;
  }
  return data === true;
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

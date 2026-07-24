import { NextRequest } from 'next/server';
import { apiData, apiError, getUserDataContext, isErrorContext, parseBody } from '@/backend/http';
import { LOCATION_CONSENT_VERSION } from '@/shared/location-consent';

export async function GET(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;

  const { data, error } = await context.db
    .from('location_consents')
    .select('consent_version, granted, created_at')
    .eq('actor_key', context.user.actorKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return apiError('CONSENT_READ_FAILED', error.message, 500);

  return apiData({
    version: LOCATION_CONSENT_VERSION,
    granted: data?.consent_version === LOCATION_CONSENT_VERSION ? Boolean(data.granted) : null,
    recordedAt: data?.created_at ?? null
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  const body = await parseBody<{ granted?: boolean }>(request);
  if (typeof body?.granted !== 'boolean') {
    return apiError('INVALID_CONSENT', 'granted 값이 필요합니다.');
  }

  const { data, error } = await context.db
    .from('location_consents')
    .insert({
      actor_key: context.user.actorKey,
      consent_version: LOCATION_CONSENT_VERSION,
      granted: body.granted
    })
    .select('consent_version, granted, created_at')
    .single();
  if (error) return apiError('CONSENT_SAVE_FAILED', error.message, 500);

  return apiData(data, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}

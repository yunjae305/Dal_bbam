import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/backend/auth/current-user';
import { distanceMeters, isValidCoordinate } from '@/backend/geo';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';
import { awardStampBadges } from '@/backend/badges';
import { apiData, apiError, isMutationAllowed } from '@/backend/http';
import { hasCurrentLocationConsent } from '@/shared/location-consent';
import type { Badge } from '@/shared/types';

const DEFAULT_STAMP_RADIUS_M = 150;
const STAMP_RADIUS_M = Number(process.env.STAMP_RADIUS_M ?? DEFAULT_STAMP_RADIUS_M);

type VerifyBody = {
  placeId?: string;
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
};

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function findSupabasePlace(
  placeId: string,
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>
) {
  const query = supabase
    .from('places')
    .select('id, content_id, name, lat, lng')
    .limit(1);

  const { data, error } = validUuid(placeId)
    ? await query.eq('id', placeId)
    : await query.eq('content_id', placeId);

  if (error || !data?.[0]) {
    return null;
  }

  return data[0] as {
    id: string;
    content_id: string | null;
    name: string | null;
    lat: number | null;
    lng: number | null;
  };
}

export async function POST(request: NextRequest) {
  if (!isMutationAllowed(request)) {
    return apiError('ORIGIN_REJECTED', '허용되지 않은 요청 출처입니다.', 403);
  }
  const user = await getCurrentUser();

  if (!user) {
    return apiError('UNAUTHENTICATED', '로그인이 필요합니다.', 401);
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return apiError('DATABASE_UNAVAILABLE', '스탬프 저장소가 설정되지 않았습니다.', 503);
  }

  const { data: consent, error: consentError } = await supabase
    .from('location_consents')
    .select('consent_version, granted, created_at')
    .eq('actor_key', user.actorKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (consentError) {
    return apiError('CONSENT_READ_FAILED', '위치정보 동의를 확인하지 못했습니다.', 500);
  }
  if (!hasCurrentLocationConsent(consent)) {
    return apiError('LOCATION_CONSENT_REQUIRED', '스탬프 확인 전에 위치정보 사용에 동의해 주세요.', 403);
  }

  let body: VerifyBody;

  try {
    body = await request.json() as VerifyBody;
  } catch {
    return apiError('INVALID_BODY', '올바른 JSON 요청이 필요합니다.');
  }

  const placeId = typeof body.placeId === 'string' ? body.placeId.trim() : '';
  const lat = typeof body.lat === 'number' ? body.lat : Number.NaN;
  const lng = typeof body.lng === 'number' ? body.lng : Number.NaN;
  const accuracyMeters = body.accuracyMeters;

  if (!placeId) {
    return apiError('INVALID_PLACE', 'placeId가 필요합니다.');
  }

  if (!isValidCoordinate(lat, lng)) {
    return apiError('INVALID_COORDINATES', '유효한 GPS 좌표가 필요합니다.');
  }

  if (
    accuracyMeters !== undefined &&
    (!Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 100)
  ) {
    return apiError('LOW_ACCURACY', 'GPS 정확도가 100m 이내일 때 다시 시도해 주세요.', 422);
  }

  const supabasePlace = await findSupabasePlace(placeId, supabase);
  if (!supabasePlace) {
    return apiError(
      'STAMP_PLACE_NOT_SYNCED',
      '이 장소는 아직 스탬프 대상에 등록되지 않았습니다. 관광 데이터 동기화 후 다시 시도해 주세요.',
      409
    );
  }
  const targetLat = supabasePlace.lat;
  const targetLng = supabasePlace.lng;

  if (!isValidCoordinate(Number(targetLat), Number(targetLng))) {
    return apiError('PLACE_NOT_FOUND', '장소 좌표를 찾을 수 없습니다.', 404);
  }

  const distance = Math.round(distanceMeters({ lat, lng }, { lat: Number(targetLat), lng: Number(targetLng) }));
  const radius = Number.isFinite(STAMP_RADIUS_M) ? STAMP_RADIUS_M : DEFAULT_STAMP_RADIUS_M;
  const verified = distance <= radius;
  let persisted = false;
  let alreadyAcquired = false;
  let awardedBadges: Badge[] = [];

  if (verified) {
    const { error } = await supabase.from('stamps').insert({
      actor_key: user.actorKey,
      user_id: user.supabaseUserId ?? null,
      place_id: supabasePlace.id,
      lat: null,
      lng: null,
      accuracy_m: accuracyMeters ?? null,
      distance_m: distance
    });
    alreadyAcquired = error?.code === '23505';
    if (error && !alreadyAcquired) {
      return apiError('STAMP_SAVE_FAILED', '스탬프를 저장하지 못했습니다. 다시 시도해 주세요.', 500);
    }
    persisted = !error || alreadyAcquired;
    if (persisted) {
      awardedBadges = await awardStampBadges(supabase, user.actorKey);
    }
  }

  const result = {
    verified,
    persisted,
    alreadyAcquired,
    distanceMeters: distance,
    radiusMeters: radius,
    accuracyMeters: accuracyMeters ?? null,
    place: {
      id: supabasePlace.content_id || supabasePlace.id,
      name: supabasePlace.name
    },
    awardedBadges
  };

  if (!verified) {
    return apiError('OUTSIDE_RADIUS', `스탬프 획득 반경 밖입니다. 현재 거리 ${distance}m, 허용 반경 ${radius}m입니다.`, 422, result);
  }
  return apiData(result, { headers: { 'Cache-Control': 'private, no-store' } });
}

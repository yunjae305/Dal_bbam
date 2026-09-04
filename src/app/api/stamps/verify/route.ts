import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/backend/auth/current-user';
import { distanceMeters, isValidCoordinate } from '@/backend/geo';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';
import { awardStampBadges } from '@/backend/badges';
import { apiData, apiError, isMutationAllowed } from '@/backend/http';
import {
  awardStampRewards,
  checkpointRequiredForTarget,
  hashCheckpointToken,
  isInGyeongjuServiceArea,
  stampMaxAccuracyMeters,
  stampRadiusMeters,
  stampVerifyRateLimit,
  validUuid,
  type StampReward
} from '@/backend/stamps';
import { hasCurrentLocationConsent } from '@/shared/location-consent';
import type { Badge } from '@/shared/types';

type VerifyBody = {
  placeId?: string;
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
  checkpointToken?: string;
};

type StampPlace = {
  id: string;
  content_id: string | null;
  name: string | null;
  lat: number | null;
  lng: number | null;
};

type StampTarget = {
  id: string;
  is_active: boolean;
  checkpoint_required: boolean;
  radius_m: number | null;
};

type ClaimStampResult = {
  status?: 'acquired' | 'already_acquired' | 'checkpoint_invalid' | 'target_invalid';
  stamp_id?: string;
  checkpoint_id?: string | null;
};

async function findSupabasePlace(
  placeId: string,
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>
): Promise<{ place: StampPlace | null; failed: boolean }> {
  const query = supabase.from('places').select('id, content_id, name, lat, lng').limit(1);
  const { data, error } = validUuid(placeId)
    ? await query.eq('id', placeId)
    : await query.eq('content_id', placeId);
  return { place: (data?.[0] as StampPlace | undefined) ?? null, failed: Boolean(error) };
}

async function findStampTarget(
  placeId: string,
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>
): Promise<{ target: StampTarget | null; failed: boolean }> {
  const { data, error } = await supabase
    .from('stamp_targets')
    .select('id, is_active, checkpoint_required, radius_m')
    .eq('place_id', placeId)
    .maybeSingle();
  return { target: (data as StampTarget | null) ?? null, failed: Boolean(error) };
}

export async function POST(request: NextRequest) {
  if (!isMutationAllowed(request)) {
    return apiError('ORIGIN_REJECTED', '허용되지 않은 요청 출처입니다.', 403);
  }
  const user = await getCurrentUser();
  if (!user) return apiError('UNAUTHENTICATED', '로그인이 필요합니다.', 401);

  const supabase = createSupabaseAdminClient();
  if (!supabase) return apiError('DATABASE_UNAVAILABLE', '스탬프 저장소가 설정되지 않았습니다.', 503);

  const windowStart = new Date();
  windowStart.setSeconds(0, 0);
  const { data: withinRateLimit, error: rateLimitError } = await supabase.rpc('consume_api_rate_limit', {
    p_actor_key: user.actorKey,
    p_scope: 'stamp-verify',
    p_window_started_at: windowStart.toISOString(),
    p_limit: stampVerifyRateLimit()
  });
  if (rateLimitError) {
    return apiError('STAMP_RATE_LIMIT_UNAVAILABLE', '스탬프 요청 보호 기능을 확인하지 못했습니다.', 503);
  }
  if (withinRateLimit !== true) {
    return apiError('STAMP_RATE_LIMITED', '현장 확인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429);
  }

  const { data: consent, error: consentError } = await supabase
    .from('location_consents')
    .select('consent_version, granted, created_at')
    .eq('actor_key', user.actorKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (consentError) return apiError('CONSENT_READ_FAILED', '위치정보 동의를 확인하지 못했습니다.', 500);
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
  const checkpointToken = typeof body.checkpointToken === 'string' ? body.checkpointToken.trim() : '';
  if (!placeId) return apiError('INVALID_PLACE', 'placeId가 필요합니다.');
  if (!isValidCoordinate(lat, lng)) return apiError('INVALID_COORDINATES', '유효한 GPS 좌표가 필요합니다.');
  if (!isInGyeongjuServiceArea(lat, lng)) {
    return apiError('OUTSIDE_SERVICE_AREA', '경주 서비스 권역 안에서 다시 시도해 주세요.', 422);
  }

  const maxAccuracy = stampMaxAccuracyMeters();
  if (typeof accuracyMeters !== 'number' || !Number.isFinite(accuracyMeters)) {
    return apiError('ACCURACY_REQUIRED', 'GPS 정확도 정보가 필요합니다. 위치를 다시 확인해 주세요.', 422);
  }
  if (accuracyMeters <= 0 || accuracyMeters > maxAccuracy) {
    return apiError('LOW_ACCURACY', `GPS 정확도가 ${maxAccuracy}m 이내일 때 다시 시도해 주세요.`, 422);
  }

  const placeLookup = await findSupabasePlace(placeId, supabase);
  if (placeLookup.failed) {
    return apiError('STAMP_PLACE_LOOKUP_FAILED', '관광지 동기화 상태를 확인하지 못했습니다.', 503);
  }
  const supabasePlace = placeLookup.place;
  if (!supabasePlace) {
    return apiError(
      'STAMP_PLACE_NOT_SYNCED',
      '이 장소는 관광 데이터베이스에 동기화되지 않았습니다. 관리자에게 장소 동기화를 요청해 주세요.',
      409
    );
  }

  const targetLookup = await findStampTarget(supabasePlace.id, supabase);
  if (targetLookup.failed) {
    return apiError('STAMP_TARGETS_UNAVAILABLE', '스탬프 대상 설정을 확인하지 못했습니다.', 503);
  }
  const target = targetLookup.target;
  if (!target?.is_active) {
    return apiError('STAMP_NOT_TARGET', '현재 운영 중인 스탬프 대상 장소가 아닙니다.', 409);
  }

  const targetLat = Number(supabasePlace.lat);
  const targetLng = Number(supabasePlace.lng);
  if (!isValidCoordinate(targetLat, targetLng) || !isInGyeongjuServiceArea(targetLat, targetLng)) {
    return apiError('STAMP_TARGET_INVALID', '스탬프 대상 장소의 좌표를 확인할 수 없습니다.', 503);
  }

  const rawDistance = distanceMeters({ lat, lng }, { lat: targetLat, lng: targetLng });
  const distance = Math.round(rawDistance);
  const radius = stampRadiusMeters(target.radius_m);
  const verified = rawDistance <= radius;
  const baseResult = {
    verified,
    persisted: false,
    alreadyAcquired: false,
    checkpointVerified: false,
    distanceMeters: distance,
    radiusMeters: radius,
    accuracyMeters,
    place: { id: supabasePlace.content_id || supabasePlace.id, name: supabasePlace.name }
  };
  if (!verified) {
    return apiError(
      'OUTSIDE_RADIUS',
      `스탬프 획득 반경 밖입니다. 현재 거리 ${distance}m, 허용 반경 ${radius}m입니다.`,
      422,
      baseResult
    );
  }

  const requiresCheckpoint = checkpointRequiredForTarget(Boolean(target.checkpoint_required));
  if (requiresCheckpoint && (checkpointToken.length < 16 || checkpointToken.length > 256)) {
    return apiError('CHECKPOINT_REQUIRED', '현장 QR 체크포인트를 먼저 스캔해 주세요.', 403);
  }

  const { data: claimData, error: claimError } = await supabase.rpc('claim_stamp', {
    p_actor_key: user.actorKey,
    p_user_id: user.supabaseUserId ?? null,
    p_place_id: supabasePlace.id,
    p_stamp_target_id: target.id,
    p_checkpoint_required: requiresCheckpoint,
    p_token_hash: checkpointToken ? hashCheckpointToken(checkpointToken) : null,
    p_accuracy_m: accuracyMeters,
    p_distance_m: distance
  });
  if (claimError) {
    console.error('[stamps] atomic claim failed', claimError.message);
    return apiError('STAMP_SAVE_FAILED', '스탬프를 저장하지 못했습니다. 다시 시도해 주세요.', 500);
  }
  const claim = (claimData ?? {}) as ClaimStampResult;
  if (claim.status === 'checkpoint_invalid') {
    return apiError('CHECKPOINT_INVALID', '만료되었거나 다른 장소의 체크포인트입니다.', 403);
  }
  if (claim.status === 'target_invalid') {
    return apiError('STAMP_NOT_TARGET', '현재 운영 중인 스탬프 대상 장소가 아닙니다.', 409);
  }
  if (claim.status !== 'acquired' && claim.status !== 'already_acquired') {
    return apiError('STAMP_SAVE_FAILED', '스탬프 저장 결과를 확인하지 못했습니다.', 500);
  }
  const checkpointId = claim.checkpoint_id ? String(claim.checkpoint_id) : null;
  const alreadyAcquired = claim.status === 'already_acquired';

  let awardedBadges: Badge[] = [];
  let awardedRewards: StampReward[] = [];
  const postProcessingWarnings: string[] = [];
  const [badgeResult, rewardResult] = await Promise.allSettled([
    awardStampBadges(supabase, user.actorKey),
    awardStampRewards(supabase, user.actorKey)
  ]);
  if (badgeResult.status === 'fulfilled') {
    awardedBadges = badgeResult.value;
  } else {
    postProcessingWarnings.push('BADGE_AWARD_DELAYED');
    console.error('[stamps] badge award delayed', badgeResult.reason);
  }
  if (rewardResult.status === 'fulfilled') {
    awardedRewards = rewardResult.value;
  } else {
    postProcessingWarnings.push('REWARD_AWARD_DELAYED');
    console.error('[stamps] reward award delayed', rewardResult.reason);
  }

  return apiData({
    ...baseResult,
    persisted: true,
    alreadyAcquired,
    checkpointVerified: Boolean(checkpointId),
    awardedBadges,
    awardedRewards,
    postProcessingWarnings
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

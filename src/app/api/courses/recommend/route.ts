import { NextRequest } from 'next/server';
import {
  apiData,
  apiError,
  checkRateLimit,
  getUserDataContext,
  isErrorContext,
  parseBody
} from '@/backend/http';
import { createCoursePlan } from '@/backend/course-planner';
import { getTourMvpData } from '@/backend/tour-mvp-data';
import { placeToSummary } from '@/backend/place-mapper';
import { isLang } from '@/shared/i18n';
import { placeCategories, type CourseRequest } from '@/shared/types';
import { isFeatureEnabled } from '@/backend/features';

function parseRequest(value: Partial<CourseRequest> | null): CourseRequest | null {
  if (!value) return null;
  const days = Math.floor(Number(value.days ?? 1));
  if (days < 1 || days > 7) return null;

  const companion = ['solo', 'couple', 'family', 'friends', 'group'].includes(String(value.companion))
    ? value.companion as CourseRequest['companion']
    : 'solo';
  const pace = ['relaxed', 'balanced', 'packed'].includes(String(value.pace))
    ? value.pace as CourseRequest['pace']
    : 'balanced';
  const transport = ['walking', 'car', 'public'].includes(String(value.transport))
    ? value.transport as CourseRequest['transport']
    : 'walking';
  const lang = isLang(value.lang) ? value.lang : 'ko';
  const interests = Array.isArray(value.interests)
    ? value.interests.filter(item => placeCategories.includes(item)).slice(0, 7)
    : [];

  return {
    purpose: value.purpose?.slice(0, 120),
    days,
    companion,
    interests,
    pace,
    transport,
    lang
  };
}

export async function POST(request: NextRequest) {
  if (!isFeatureEnabled('ai')) return apiError('FEATURE_DISABLED', 'AI 코스 기능이 비활성화되어 있습니다.', 503);
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;
  if (!await checkRateLimit(context, 'ai:course', 5)) {
    return apiError('RATE_LIMITED', '코스 추천 요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429);
  }

  const parsed = parseRequest(await parseBody<Partial<CourseRequest>>(request));
  if (!parsed) return apiError('INVALID_COURSE_REQUEST', '1~7일 범위의 올바른 코스 조건이 필요합니다.');

  const data = await getTourMvpData(parsed.lang);
  const candidates = data.places.map(placeToSummary).filter(place =>
    Number.isFinite(place.coordinates[0]) && Number.isFinite(place.coordinates[1])
  );
  if (!candidates.length) return apiError('NO_CANDIDATES', '추천할 관광지 데이터가 없습니다.', 503);

  const plan = await createCoursePlan(parsed, candidates, context.user.actorKey);
  return apiData(plan, {
    meta: { fallback: plan.generatedBy === 'fallback', candidateCount: candidates.length },
    headers: { 'Cache-Control': 'private, no-store' }
  });
}

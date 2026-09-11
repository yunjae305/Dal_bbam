import { NextRequest } from 'next/server';
import {
  apiData,
  apiError,
  checkRateLimit,
  getUserDataContext,
  isErrorContext,
  parseBody,
  rateLimitError
} from '@/backend/http';
import { createCoursePlan } from '@/backend/course-planner';
import { validCourseStartTime } from '@/backend/course-timing';
import { getTourMvpData } from '@/backend/tour-mvp-data';
import { placeToSummary } from '@/backend/place-mapper';
import { isLang } from '@/shared/i18n';
import { placeCategories, type CourseRequest } from '@/shared/types';

function parseRequest(value: Partial<CourseRequest> | null): CourseRequest | null {
  if (!value || typeof value !== 'object') return null;
  const days = value.days === undefined ? 1 : value.days;
  if (!Number.isInteger(days) || days < 1 || days > 7) return null;
  if (value.purpose !== undefined && typeof value.purpose !== 'string') return null;
  if (value.startTime !== undefined && !validCourseStartTime(value.startTime)) return null;

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
    startTime: value.startTime ?? '09:00',
    days: days as number,
    companion,
    interests,
    pace,
    transport,
    lang
  };
}

export async function POST(request: NextRequest) {
  // With AI switched off the rule-based planner still answers (generatedBy: 'fallback').
  const context = await getUserDataContext(request);
  if (isErrorContext(context)) return context.response;

  const parsed = parseRequest(await parseBody<Partial<CourseRequest>>(request));
  if (!parsed) return apiError('INVALID_COURSE_REQUEST', '1~7일 범위의 올바른 코스 조건이 필요합니다.');

  const rateLimit = await checkRateLimit(context, 'ai:course', 5);
  if (rateLimit !== 'ok') return rateLimitError(rateLimit, '코스 추천 요청이 많습니다. 잠시 후 다시 시도해 주세요.');

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

import { distanceMeters } from '@/backend/geo';
import { generateStructured, isOpenAiAvailable } from '@/backend/openai';
import { resolveDirections } from '@/backend/kakao-directions';
import { courseLegKey, timeCourseStops, type CourseLeg } from '@/backend/course-timing';
import type {
  CoursePlan,
  CourseRequest,
  CourseStop,
  PlaceSummary
} from '@/shared/types';

type AiCourse = {
  title: string;
  summary: string;
  stops: Array<{
    contentId: string;
    reason: string;
    stayMinutes: number;
  }>;
};

const courseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'stops'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 80 },
    summary: { type: 'string', minLength: 1, maxLength: 300 },
    stops: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['contentId', 'reason', 'stayMinutes'],
        properties: {
          contentId: { type: 'string', minLength: 1, maxLength: 100 },
          reason: { type: 'string', minLength: 1, maxLength: 200 },
          stayMinutes: { type: 'integer', minimum: 15, maximum: 240 }
        }
      }
    }
  }
};

function desiredStopCount(request: CourseRequest, candidates: PlaceSummary[]): number {
  const perDay = request.pace === 'relaxed' ? 3 : request.pace === 'packed' ? 6 : 4;
  return Math.min(candidates.length, Math.max(1, request.days * perDay), 12);
}

function interestScore(place: PlaceSummary, request: CourseRequest): number {
  const categoryScore = request.interests.includes(place.category) ? 10 : 0;
  const purpose = request.purpose?.toLowerCase() ?? '';
  const text = [place.name, place.description, ...place.tags].join(' ').toLowerCase();
  const purposeScore = purpose && text.includes(purpose) ? 4 : 0;
  const ratingScore = place.rating ?? 0;
  return categoryScore + purposeScore + ratingScore;
}

export function orderStopsByDistance(
  stops: CourseStop[],
  candidates: PlaceSummary[]
): CourseStop[] {
  if (stops.length < 2) return stops.map((stop, index) => ({ ...stop, order: index }));
  const byId = new Map(candidates.map(place => [place.contentId, place]));
  const remaining = [...stops];
  const ordered: CourseStop[] = [];
  let current = { lat: 35.8562, lng: 129.2247 };

  while (remaining.length) {
    remaining.sort((a, b) => {
      const placeA = byId.get(a.contentId);
      const placeB = byId.get(b.contentId);
      if (!placeA) return 1;
      if (!placeB) return -1;
      return distanceMeters(current, { lat: placeA.coordinates[0], lng: placeA.coordinates[1] }) -
        distanceMeters(current, { lat: placeB.coordinates[0], lng: placeB.coordinates[1] });
    });
    const next = remaining.shift();
    if (!next) break;
    const place = byId.get(next.contentId);
    ordered.push({ ...next, order: ordered.length, place });
    if (place) current = { lat: place.coordinates[0], lng: place.coordinates[1] };
  }

  return ordered;
}

function planFromStops(
  title: string,
  summary: string,
  rawStops: CourseStop[],
  candidates: PlaceSummary[],
  request: CourseRequest,
  generatedBy: CoursePlan['generatedBy']
): CoursePlan {
  const stops = orderStopsByDistance(rawStops, candidates);
  return {
    title,
    summary,
    transport: request.transport,
    ...timeCourseStops(stops, request),
    generatedBy
  };
}

export function deterministicCoursePlan(
  request: CourseRequest,
  candidates: PlaceSummary[]
): CoursePlan {
  const copy = {
    ko: { title: '나에게 맞춘 경주 여행', suffix: '경주 여행', match: '선택한 관심사와 잘 맞는 장소입니다.', other: '이동 동선과 여행 밀도를 고려해 포함했습니다.', summary: `${request.days}일간의 관심사 맞춤 여행 코스입니다.` },
    en: { title: 'Your Gyeongju itinerary', suffix: 'in Gyeongju', match: 'Selected to match your interests.', other: 'Selected for the route and your travel pace.', summary: `A ${request.days}-day course tailored to your interests.` },
    ja: { title: 'あなたに合った慶州旅行', suffix: '慶州旅行', match: '選択した興味に合った場所です。', other: '移動経路と旅行ペースを考慮しました。', summary: `興味に合わせた${request.days}日間の旅行コースです。` },
    zh: { title: '为您定制的庆州之旅', suffix: '庆州之旅', match: '根据您的兴趣选择的地点。', other: '综合考虑路线和旅行节奏。', summary: `根据您的兴趣安排的${request.days}天旅行路线。` }
  }[request.lang];
  const selected = [...candidates]
    .sort((a, b) => interestScore(b, request) - interestScore(a, request))
    .slice(0, desiredStopCount(request, candidates));
  const stops = selected.map((place, index): CourseStop => ({
    contentId: place.contentId,
    order: index,
    reason: request.interests.includes(place.category)
      ? copy.match
      : copy.other,
    stayMinutes: request.pace === 'relaxed' ? 90 : request.pace === 'packed' ? 45 : 60,
    place
  }));

  return planFromStops(
    request.purpose ? `${request.purpose} ${copy.suffix}`.slice(0, 80) : copy.title,
    copy.summary,
    stops,
    candidates,
    request,
    'fallback'
  );
}

export function validateAiCourse(
  value: AiCourse,
  request: CourseRequest,
  candidates: PlaceSummary[]
): CoursePlan | null {
  if (!value || typeof value !== 'object' || !Array.isArray(value.stops)) return null;
  const allowed = new Map(candidates.map(place => [place.contentId, place]));
  const seen = new Set<string>();
  const maxStops = desiredStopCount(request, candidates);
  const stops: CourseStop[] = [];

  for (const stop of value.stops ?? []) {
    if (!stop || typeof stop.contentId !== 'string' || typeof stop.reason !== 'string') continue;
    if (!allowed.has(stop.contentId) || seen.has(stop.contentId)) continue;
    if (!Number.isInteger(stop.stayMinutes) || stop.stayMinutes < 15 || stop.stayMinutes > 240) continue;
    seen.add(stop.contentId);
    stops.push({
      contentId: stop.contentId,
      order: stops.length,
      reason: stop.reason.slice(0, 200),
      stayMinutes: stop.stayMinutes,
      place: allowed.get(stop.contentId)
    });
    if (stops.length >= maxStops) break;
  }

  if (typeof value.title !== 'string' || !value.title.trim() || typeof value.summary !== 'string' || !value.summary.trim() || !stops.length) return null;
  return planFromStops(
    value.title.slice(0, 80),
    value.summary.slice(0, 300),
    stops,
    candidates,
    request,
    'openai'
  );
}

export async function createCoursePlan(
  request: CourseRequest,
  candidates: PlaceSummary[],
  actorKey: string
): Promise<CoursePlan> {
  if (!isOpenAiAvailable()) return withMapTiming(deterministicCoursePlan(request, candidates), request);
  try {
    const result = await generateStructured<AiCourse>({
      name: 'tour_course',
      schema: courseSchema,
      actorKey,
      instructions: [
        `Respond in ${request.lang}.`,
        'Use only contentId values from the supplied candidates.',
        'Never invent a place.',
        'Choose a realistic number of stops for the requested days and pace.',
        'Give a concise recommendation reason and stay time for each stop.'
      ].join(' '),
      input: JSON.stringify({ request, candidates })
    });
    const validated = validateAiCourse(result.value, request, candidates);
    if (!validated) throw new Error('OpenAI course failed server validation.');
    return withMapTiming(validated, request);
  } catch {
    console.info(JSON.stringify({
      event: 'openai_fallback',
      operation: 'tour_course',
      candidateCount: candidates.length,
      lang: request.lang
    }));
    return withMapTiming(deterministicCoursePlan(request, candidates), request);
  }
}

async function withMapTiming(plan: CoursePlan, request: CourseRequest): Promise<CoursePlan> {
  if (!process.env.KAKAO_REST_API_KEY?.trim()) return plan;
  const legs = new Map<string, CourseLeg>();
  await Promise.all(plan.stops.slice(1).map(async (stop, index) => {
    const previous = plan.stops[index];
    if (!previous.place || !stop.place) return;
    const a = previous.place.coordinates;
    const b = stop.place.coordinates;
    const endpoints = {
      origin: { lat: a[0], lng: a[1] }, destination: { lat: b[0], lng: b[1] },
      originName: previous.place.name, destinationName: stop.place.name
    };
    const resolved = await resolveDirections(request.transport, endpoints, Math.round(distanceMeters(endpoints.origin, endpoints.destination)));
    if (resolved.fallback) return;
    legs.set(courseLegKey(previous.contentId, stop.contentId), {
      distanceMeters: resolved.result.distanceMeters,
      travelMinutes: Math.ceil(resolved.result.durationSeconds / 60), fromProvider: true, path: resolved.result.path
    });
  }));
  return { ...plan, ...timeCourseStops(plan.stops, request, legs) };
}

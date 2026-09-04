import { distanceMeters } from '@/backend/geo';
import { generateStructured, isOpenAiAvailable } from '@/backend/openai';
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

function totals(stops: CourseStop[]): { distance: number; minutes: number } {
  let distance = 0;
  let minutes = stops.reduce((sum, stop) => sum + stop.stayMinutes, 0);
  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1].place;
    const current = stops[index].place;
    if (!previous || !current) continue;
    const leg = distanceMeters(
      { lat: previous.coordinates[0], lng: previous.coordinates[1] },
      { lat: current.coordinates[0], lng: current.coordinates[1] }
    );
    distance += leg;
    minutes += Math.round(leg / 250);
  }
  return { distance: Math.round(distance), minutes };
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
  const total = totals(stops);
  return {
    title,
    summary,
    stops,
    transport: request.transport,
    totalDistanceMeters: total.distance,
    estimatedMinutes: total.minutes,
    generatedBy
  };
}

export function deterministicCoursePlan(
  request: CourseRequest,
  candidates: PlaceSummary[]
): CoursePlan {
  const selected = [...candidates]
    .sort((a, b) => interestScore(b, request) - interestScore(a, request))
    .slice(0, desiredStopCount(request, candidates));
  const stops = selected.map((place, index): CourseStop => ({
    contentId: place.contentId,
    order: index,
    reason: request.interests.includes(place.category)
      ? '선택한 관심사와 잘 맞는 장소입니다.'
      : '이동 동선과 여행 밀도를 고려해 포함했습니다.',
    stayMinutes: request.pace === 'relaxed' ? 90 : request.pace === 'packed' ? 45 : 60,
    place
  }));

  return planFromStops(
    request.purpose ? `${request.purpose} 경주 여행` : '나에게 맞춘 경주 여행',
    `${request.days}일 일정과 ${request.transport} 이동을 고려한 추천 코스입니다.`,
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
  const allowed = new Map(candidates.map(place => [place.contentId, place]));
  const seen = new Set<string>();
  const maxStops = desiredStopCount(request, candidates);
  const stops: CourseStop[] = [];

  for (const stop of value.stops ?? []) {
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

  if (!value.title?.trim() || !value.summary?.trim() || !stops.length) return null;
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
  if (!isOpenAiAvailable()) return deterministicCoursePlan(request, candidates);
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
    return validated;
  } catch {
    console.info(JSON.stringify({
      event: 'openai_fallback',
      operation: 'tour_course',
      candidateCount: candidates.length,
      lang: request.lang
    }));
    return deterministicCoursePlan(request, candidates);
  }
}

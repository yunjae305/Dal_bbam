import { distanceMeters } from '@/backend/geo';
import type { CourseRequest, CourseStop, TransportMode } from '@/shared/types';

export type CourseLeg = { distanceMeters: number; travelMinutes: number; fromProvider: boolean; path?: [number, number][]; pathSource?: 'provider' | 'straight-line' };
export const courseLegKey = (from: string, to: string) => `${from}:${to}`;
export const validCourseStartTime = (value: unknown): value is string =>
  typeof value === 'string' && /^(0[6-9]|1[0-8]):[0-5]\d$/.test(value);

export function estimatedCourseLeg(from: CourseStop, to: CourseStop, mode: TransportMode): CourseLeg {
  const a = from.place?.coordinates;
  const b = to.place?.coordinates;
  const distance = a && b ? distanceMeters({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] }) : 0;
  const metersPerMinute = { walking: 75, car: 498, public: 330 }[mode];
  return {
    distanceMeters: Math.round(distance),
    travelMinutes: Math.ceil(distance / metersPerMinute) + (mode === 'public' && distance > 0 ? 10 : 0),
    fromProvider: false, path: a && b ? [a, b] : undefined
  };
}

const clockTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Split visits into requested days; every day has its own starting point and ends by 22:00. */
export function timeCourseStops(
  input: CourseStop[],
  request: Pick<CourseRequest, 'days' | 'startTime' | 'transport'>,
  legs = new Map<string, CourseLeg>()
) {
  const startTime = validCourseStartTime(request.startTime) ? request.startTime : '09:00';
  const [hours, minutes] = startTime.split(':').map(Number);
  const start = hours * 60 + minutes;
  const days = Math.min(7, Math.max(1, request.days));
  const pending = [...input];
  const stops: CourseStop[] = [];
  let totalDistanceMeters = 0;
  let estimatedMinutes = 0;
  let providerLegs = 0;
  let estimatedLegs = 0;

  for (let dayIndex = 0; dayIndex < days && pending.length; dayIndex += 1) {
    const quota = Math.ceil(pending.length / (days - dayIndex));
    let cursor = start;
    let previous: CourseStop | undefined;
    let count = 0;
    while (pending.length && count < quota) {
      const next = pending[0];
      const leg = previous
        ? legs.get(courseLegKey(previous.contentId, next.contentId)) ?? estimatedCourseLeg(previous, next, request.transport)
        : { distanceMeters: 0, travelMinutes: 0, fromProvider: false };
      const arrival = cursor + leg.travelMinutes;
      if (arrival + next.stayMinutes > 22 * 60) break;
      pending.shift();
      stops.push({
        ...next, order: stops.length, dayIndex,
        startTime: clockTime(arrival), endTime: clockTime(arrival + next.stayMinutes),
        travelMinutes: leg.travelMinutes, distanceMeters: leg.distanceMeters, travelPath: leg.path,
        travelSource: leg.fromProvider ? 'map-provider' : 'estimated',
        travelPathSource: leg.pathSource ?? (leg.fromProvider ? 'provider' : 'straight-line')
      });
      if (previous) {
        if (leg.fromProvider) providerLegs += 1;
        else estimatedLegs += 1;
      }
      totalDistanceMeters += leg.distanceMeters;
      estimatedMinutes += leg.travelMinutes + next.stayMinutes;
      cursor = arrival + next.stayMinutes;
      previous = next;
      count += 1;
    }
  }
  return {
    stops, days, startTime, totalDistanceMeters, estimatedMinutes,
    timingSource: providerLegs && estimatedLegs ? 'mixed' as const : providerLegs ? 'map-provider' as const : 'estimated' as const
  };
}

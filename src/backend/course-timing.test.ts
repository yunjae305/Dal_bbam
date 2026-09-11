import { describe, expect, it } from 'vitest';
import { courseLegKey, estimatedCourseLeg, timeCourseStops, validCourseStartTime } from '@/backend/course-timing';
import type { CourseStop } from '@/shared/types';

function stop(index: number, stayMinutes = 60): CourseStop {
  return { contentId: String(index), order: index, reason: 'Visit', stayMinutes,
    place: { contentId: String(index), name: `Place ${index}`, description: '', address: '', imageUrl: '', category: 'heritage', tags: [], source: 'sample', coordinates: [35.856 + index * 0.01, 129.224] } };
}

describe('course daily route timing', () => {
  it('accounts for walking speed rather than car speed', () => {
    const walking = estimatedCourseLeg(stop(0), stop(1), 'walking');
    const car = estimatedCourseLeg(stop(0), stop(1), 'car');
    expect(walking.distanceMeters).toBe(car.distanceMeters);
    expect(walking.travelMinutes).toBeGreaterThan(car.travelMinutes * 3);
  });

  it('splits visits across all requested days and restarts each day at the selected time', () => {
    const result = timeCourseStops(Array.from({ length: 6 }, (_, index) => stop(index)), { days: 3, startTime: '10:30', transport: 'walking' });
    expect(result.stops.map(item => item.dayIndex)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(result.stops.filter(item => item.travelMinutes === 0).map(item => item.startTime)).toEqual(['10:30', '10:30', '10:30']);
    expect(result.estimatedMinutes).toBe(6 * 60 + result.stops.reduce((sum, item) => sum + (item.travelMinutes ?? 0), 0));
    expect(result.totalDistanceMeters).toBe(result.stops.reduce((sum, item) => sum + (item.distanceMeters ?? 0), 0));
  });

  it('uses provider distance and duration for arrival times', () => {
    const legs = new Map([[courseLegKey('0', '1'), { distanceMeters: 4567, travelMinutes: 27, fromProvider: true }]]);
    const result = timeCourseStops([stop(0), stop(1)], { days: 1, transport: 'car' }, legs);
    expect(result.stops[1]).toMatchObject({ startTime: '10:27', endTime: '11:27', travelMinutes: 27 });
    expect(result).toMatchObject({ timingSource: 'map-provider', totalDistanceMeters: 4567, estimatedMinutes: 147 });
  });

  it('does not schedule a visit past the daily end or wrap into midnight', () => {
    const result = timeCourseStops([stop(0, 240), stop(1, 240), stop(2, 240)], { days: 2, startTime: '18:00', transport: 'car' });
    expect(result.stops).toHaveLength(2);
    expect(result.stops.map(item => [item.dayIndex, item.startTime, item.endTime])).toEqual([[0, '18:00', '22:00'], [1, '18:00', '22:00']]);
  });

  it('labels partial provider coverage and enforces start-time boundaries', () => {
    const legs = new Map([[courseLegKey('0', '1'), { distanceMeters: 100, travelMinutes: 1, fromProvider: true }]]);
    expect(timeCourseStops([stop(0), stop(1), stop(2)], { days: 1, transport: 'walking' }, legs).timingSource).toBe('mixed');
    expect(validCourseStartTime('06:00')).toBe(true);
    expect(validCourseStartTime('18:59')).toBe(true);
    for (const time of ['05:59', '19:00', '09:99', 'bad', null]) expect(validCourseStartTime(time)).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ directions: vi.fn() }));
vi.mock('@/backend/openai', () => ({ isOpenAiAvailable: () => false, generateStructured: vi.fn() }));
vi.mock('@/backend/kakao-directions', () => ({ resolveDirections: mocks.directions }));
import { createCoursePlan } from '@/backend/course-planner';
import type { CourseRequest, PlaceSummary } from '@/shared/types';

const request: CourseRequest = { days: 1, companion: 'family', interests: ['heritage'], pace: 'balanced', transport: 'car', lang: 'en', startTime: '10:00' };
const places: PlaceSummary[] = [0, 1].map(index => ({ contentId: String(index), name: `Place ${index}`, category: 'heritage', description: '', address: '', imageUrl: '', coordinates: [35.8562 + index * 0.001, 129.2247], tags: [], source: 'sample' }));
beforeEach(() => { vi.stubEnv('KAKAO_REST_API_KEY', 'configured'); mocks.directions.mockReset(); });
afterEach(() => vi.unstubAllEnvs());

describe('course planner map provider integration', () => {
  it('uses the shared routing provider for the requested mode and passes geometry to the UI', async () => {
    const path = [[35.8562, 129.2247], [35.8572, 129.2247]];
    mocks.directions.mockResolvedValue({ fallback: false, result: { distanceMeters: 1500, durationSeconds: 420, path } });
    const plan = await createCoursePlan(request, places, 'owner');
    expect(mocks.directions).toHaveBeenCalledWith('car', expect.objectContaining({ originName: 'Place 0', destinationName: 'Place 1' }), expect.any(Number));
    expect(plan).toMatchObject({ generatedBy: 'fallback', timingSource: 'map-provider', estimatedMinutes: 127, totalDistanceMeters: 1500 });
    expect(plan.stops[1]).toMatchObject({ startTime: '11:07', endTime: '12:07', travelPath: path });
  });
  it('retains transparent mode-based estimates when routing is unavailable', async () => {
    mocks.directions.mockResolvedValue({ fallback: true });
    const plan = await createCoursePlan({ ...request, transport: 'walking' }, places, 'owner');
    expect(plan.timingSource).toBe('estimated');
    expect(plan.stops[1].travelMinutes).toBeGreaterThan(0);
    expect(plan.stops[1].travelPath).toEqual([places[0].coordinates, places[1].coordinates]);
  });
});

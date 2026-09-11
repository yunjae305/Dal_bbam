import { describe, expect, it } from 'vitest';
import {
  deterministicCoursePlan,
  validateAiCourse
} from '@/backend/course-planner';
import type { CourseRequest, PlaceSummary } from '@/shared/types';

const request: CourseRequest = {
  days: 1,
  companion: 'family',
  interests: ['heritage'],
  pace: 'balanced',
  transport: 'walking',
  lang: 'ko'
};

const candidates: PlaceSummary[] = [
  {
    contentId: '1',
    category: 'heritage',
    name: '문화유산 A',
    description: '설명',
    address: '경주',
    imageUrl: '/a.jpg',
    coordinates: [35.856, 129.224],
    tags: ['역사'],
    rating: 4.8,
    source: 'sample'
  },
  {
    contentId: '2',
    category: 'food',
    name: '맛집 B',
    description: '설명',
    address: '경주',
    imageUrl: '/b.jpg',
    coordinates: [35.86, 129.23],
    tags: ['음식'],
    rating: 4.5,
    source: 'sample'
  }
];

describe('course planner', () => {
  it('never includes unknown or duplicate content IDs from AI output', () => {
    const plan = validateAiCourse({
      title: '검증 코스',
      summary: '요약',
      stops: [
        { contentId: '1', reason: '관심사', stayMinutes: 60 },
        { contentId: 'missing', reason: '환각', stayMinutes: 60 },
        { contentId: '1', reason: '중복', stayMinutes: 60 }
      ]
    }, request, candidates);

    expect(plan?.stops.map(stop => stop.contentId)).toEqual(['1']);
  });

  it('rejects invalid stay time and falls back deterministically', () => {
    expect(validateAiCourse({
      title: '잘못된 코스',
      summary: '요약',
      stops: [{ contentId: '1', reason: '너무 김', stayMinutes: 999 }]
    }, request, candidates)).toBeNull();

    expect(deterministicCoursePlan(request, candidates)).toMatchObject({
      generatedBy: 'fallback',
      transport: 'walking'
    });
  });

  it('uses the selected language for deterministic recommendations', () => {
    for (const lang of ['en', 'ja', 'zh'] as const) {
      const plan = deterministicCoursePlan({ ...request, lang, days: 2 }, candidates);
      expect(plan.days).toBe(2);
      expect(plan.title).not.toMatch(/[가-힣]/);
      expect(plan.summary).not.toMatch(/[가-힣]/);
      expect(plan.stops.every(stop => stop.startTime && stop.endTime)).toBe(true);
    }
  });
});

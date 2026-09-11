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

  it('puts landmarks first when database places carry no rating', () => {
    // Database rows reach the planner with rating 0, so everything used to tie.
    const unrated = (contentId: string, name: string, category: PlaceSummary['category'], lng: number): PlaceSummary => ({
      contentId, category, name, description: '', address: '경주', imageUrl: '', coordinates: [35.83, lng], tags: [], rating: 0, source: 'database'
    });
    const plan = deterministicCoursePlan({ ...request, pace: 'relaxed', transport: 'car' }, [
      unrated('c1', '황리단길 생활문화센터', 'heritage', 129.21),
      unrated('c2', '경주 문화원', 'heritage', 129.22),
      unrated('c3', '불국사', 'heritage', 129.33),
      unrated('c4', '경주 첨성대', 'attraction', 129.218),
      unrated('c5', '동궁과 월지', 'heritage', 129.226)
    ]);
    expect(plan.stops.map(stop => stop.contentId).sort()).toEqual(['c3', 'c4', 'c5']);
    // 첨성대 is an attraction in TourAPI but still matches a heritage request.
    expect(plan.stops.find(stop => stop.contentId === 'c4')?.reason).toBe('선택한 관심사와 잘 맞는 장소입니다.');
  });

  it('gives every selected interest a share of the stops', () => {
    const spot = (contentId: string, name: string, category: PlaceSummary['category']): PlaceSummary => ({
      contentId, category, name, description: '', address: '경주', imageUrl: '', coordinates: [35.835, 129.22], tags: [], rating: 0, source: 'database'
    });
    const plan = deterministicCoursePlan({ ...request, interests: ['heritage', 'food'], days: 2, pace: 'relaxed', transport: 'car' }, [
      spot('h1', '경주 첨성대', 'attraction'), spot('h2', '불국사', 'heritage'), spot('h3', '동궁과 월지', 'heritage'),
      spot('h4', '월정교', 'attraction'), spot('h5', '국립경주박물관', 'heritage'), spot('h6', '대릉원', 'attraction'),
      spot('f1', '교동 한정식', 'food'), spot('f2', '황남 밀면', 'food'), spot('f3', '경주 빵집', 'food')
    ]);
    const categories = plan.stops.map(stop => stop.place?.category);
    expect(plan.stops).toHaveLength(6);
    expect(categories.filter(category => category === 'food')).toHaveLength(3);
  });

  it('keeps a walking day within reach of downtown', () => {
    const at = (contentId: string, name: string, lat: number, lng: number): PlaceSummary => ({
      contentId, category: 'heritage', name, description: '', address: '경주', imageUrl: '', coordinates: [lat, lng], tags: [], rating: 0, source: 'database'
    });
    const places = [
      at('bulguksa', '불국사', 35.7901, 129.332), // about 11 km from downtown
      at('cheom', '경주 첨성대', 35.8343, 129.2185),
      at('wolji', '동궁과 월지', 35.8347, 129.2266)
    ];
    const walking = deterministicCoursePlan(request, places).stops.map(stop => stop.contentId);
    expect(walking).not.toContain('bulguksa');
    expect(walking).toEqual(expect.arrayContaining(['cheom', 'wolji']));

    const driving = deterministicCoursePlan({ ...request, transport: 'car' }, places).stops.map(stop => stop.contentId);
    expect(driving).toContain('bulguksa');
  });

  it('keeps a sub-facility out when its main site is already a stop', () => {
    const site = (contentId: string, name: string): PlaceSummary => ({
      contentId, category: 'heritage', name, description: '', address: '경주', imageUrl: '', coordinates: [35.83, 129.228], tags: [], rating: 0, source: 'database'
    });
    const plan = deterministicCoursePlan(request, [
      site('m2', '국립경주박물관 신라천년서고'),
      site('m1', '국립경주박물관'),
      site('b1', '불국사')
    ]);
    const ids = plan.stops.map(stop => stop.contentId);
    expect(ids).toContain('m1');
    expect(ids).not.toContain('m2');
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

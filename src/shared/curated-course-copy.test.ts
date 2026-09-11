import { describe, expect, it } from 'vitest';
import { curatedCourses } from '../../scripts/seed-curated-courses.mjs';
import { localizeCuratedCourse } from './curated-course-copy';

const course = {
  title: '달빛 야경 산책 코스',
  description: '해가 지면 시작되는 경주의 두 번째 얼굴. 달밤의 왕경을 걸어서 즐기는 야경 코스입니다.',
  course_places: [{ reason: '연못에 비치는 야경의 백미', order_index: 0 }, { reason: '관리자가 새로 적은 메모', order_index: 1 }]
};

describe('curated course translations', () => {
  it('renders a seeded course in the visitor language', () => {
    const en = localizeCuratedCourse(course, 'en');
    expect(en.title).toBe('Moonlit Night Walk');
    expect(en.description).toMatch(/moonlight/);
    expect(en.course_places[0].reason).toBe('The finest night view, mirrored in the pond');
    // A note added later by an admin has no translation and stays as written.
    expect(en.course_places[1].reason).toBe('관리자가 새로 적은 메모');
  });

  it('leaves Korean and untranslated courses untouched', () => {
    expect(localizeCuratedCourse(course, 'ko')).toBe(course);
    const custom = { ...course, title: '관리자가 만든 코스' };
    expect(localizeCuratedCourse(custom, 'ja')).toBe(custom);
  });

  it('covers every seeded course, description and stop in every language', () => {
    for (const seed of curatedCourses) {
      for (const lang of ['en', 'ja', 'zh'] as const) {
        const localized = localizeCuratedCourse({
          title: seed.title,
          description: seed.description,
          course_places: seed.stops.map(stop => ({ reason: stop.reason }))
        }, lang);
        expect(localized.title, `${seed.title} ${lang}`).not.toMatch(/[가-힣]/);
        expect(localized.description, `${seed.title} ${lang}`).not.toMatch(/[가-힣]/);
        for (const stop of localized.course_places) expect(stop.reason, `${seed.title} ${lang}`).not.toMatch(/[가-힣]/);
      }
    }
  });
});

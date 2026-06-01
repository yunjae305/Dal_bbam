import { mvpData } from './data';
import type { Course, RecommendationRequest } from '@/shared/types';

export function recommendCourse(input: RecommendationRequest): Course {
  const interests = input.interests ?? [];
  const persona = input.persona;

  const score = (course: Course) => {
    const focusScore = course.focus.filter(item => interests.includes(item)).length * 2;
    const personaScore = persona && course.persona === persona ? 3 : 0;

    return focusScore + personaScore;
  };

  return [...mvpData.courses].sort((a, b) => score(b) - score(a))[0];
}

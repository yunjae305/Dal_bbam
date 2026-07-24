import { describe, expect, it } from 'vitest';
import { normalizePlaceCategory } from '@/backend/supabase/places';

describe('normalizePlaceCategory', () => {
  it('keeps category codes stable', () => {
    expect(normalizePlaceCategory('heritage')).toBe('heritage');
    expect(normalizePlaceCategory('food')).toBe('food');
  });

  it('migrates legacy Korean labels', () => {
    expect(normalizePlaceCategory('문화재')).toBe('heritage');
    expect(normalizePlaceCategory('음식점')).toBe('food');
    expect(normalizePlaceCategory('숙박')).toBe('lodging');
  });

  it('uses attraction for unknown values', () => {
    expect(normalizePlaceCategory('unknown')).toBe('attraction');
    expect(normalizePlaceCategory(null)).toBe('attraction');
  });
});

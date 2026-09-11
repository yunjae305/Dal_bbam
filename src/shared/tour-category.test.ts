import { describe, expect, it } from 'vitest';
import { tourCategory } from '@/shared/tour-category';

describe('TourAPI categories used by map and catalogue sync', () => {
  it('distinguishes nature, heritage and experiences within tourist attractions', () => {
    expect(tourCategory('12', 'A01', 'A0101')).toBe('nature');
    expect(tourCategory('12', 'A02', 'A0201')).toBe('heritage');
    expect(tourCategory('12', 'A02', 'A0203')).toBe('experience');
    expect(tourCategory('12')).toBe('attraction');
  });
  it('preserves restaurant, lodging and festival content types', () => {
    expect(tourCategory('39', 'A01')).toBe('food');
    expect(tourCategory('32')).toBe('lodging');
    expect(tourCategory('15')).toBe('festival');
    expect(tourCategory('14')).toBe('heritage');
    expect(tourCategory('unknown')).toBe('attraction');
  });
});

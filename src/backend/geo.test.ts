import { describe, expect, it } from 'vitest';
import { distanceMeters, isValidCoordinate } from '@/backend/geo';

describe('geo', () => {
  it('handles a stamp radius boundary without rounding the input', () => {
    const origin = { lat: 35.8562, lng: 129.2247 };
    const roughly150mNorth = { lat: 35.857548, lng: 129.2247 };
    const distance = distanceMeters(origin, roughly150mNorth);
    expect(distance).toBeGreaterThan(149);
    expect(distance).toBeLessThan(151);
  });

  it('rejects invalid coordinates', () => {
    expect(isValidCoordinate(35.8, 129.2)).toBe(true);
    expect(isValidCoordinate(91, 129.2)).toBe(false);
    expect(isValidCoordinate(35.8, Number.NaN)).toBe(false);
  });
});

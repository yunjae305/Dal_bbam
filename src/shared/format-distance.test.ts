import { describe, expect, it } from 'vitest';
import { formatDistance } from './format-distance';

describe('formatDistance', () => {
  it('keeps metres under a kilometre and never shows zero', () => {
    expect(formatDistance(58)).toBe('58m');
    expect(formatDistance(0.4)).toBe('1m');
  });

  it('switches to kilometres so a far-off stamp stays readable', () => {
    expect(formatDistance(11332)).toBe('11.3km');
    expect(formatDistance(288038)).toBe('288km'); // was "288038m" on the stamp card
  });
});

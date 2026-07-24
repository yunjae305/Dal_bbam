import { describe, expect, it } from 'vitest';
import { dateRange, moveScheduleItem } from '@/frontend/schedule-utils';

describe('mobile schedule ordering', () => {
  it('moves an item without mutating the current list', () => {
    const current = ['a', 'b', 'c'];
    expect(moveScheduleItem(current, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(current).toEqual(['a', 'b', 'c']);
  });

  it('keeps invalid moves stable and enumerates multi-day trips', () => {
    const current = ['a', 'b'];
    expect(moveScheduleItem(current, 0, -1)).toBe(current);
    expect(dateRange('2026-07-24', '2026-07-26')).toEqual([
      '2026-07-24',
      '2026-07-25',
      '2026-07-26'
    ]);
  });
});

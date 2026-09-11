import { describe, expect, it } from 'vitest';
import { addDateDays, dateRange, moveScheduleItem } from '@/frontend/schedule-utils';

describe('mobile schedule ordering', () => {
  it('moves an item without mutating the current list', () => {
    const current = ['a', 'b', 'c'];
    expect(moveScheduleItem(current, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(current).toEqual(['a', 'b', 'c']);
  });

  it('supports long trips and rejects calendar rollover dates', () => {
    expect(dateRange('2026-09-01', '2026-10-15')).toHaveLength(45);
    expect(dateRange('2026-02-30', '2026-03-04')).toEqual([]);
    expect(addDateDays('2026-12-31', 1)).toBe('2027-01-01');
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

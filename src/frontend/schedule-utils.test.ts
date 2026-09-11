import { describe, expect, it } from 'vitest';
import { addDateDays, dateRange, moveScheduleItem, reflowStartTimes } from '@/frontend/schedule-utils';

describe('mobile schedule ordering', () => {
  it('moves an item without mutating the current list', () => {
    const current = ['a', 'b', 'c'];
    expect(moveScheduleItem(current, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(current).toEqual(['a', 'b', 'c']);
  });

  it('keeps times reading top to bottom after a stop moves', () => {
    const day = [
      { name: '대릉원', visit_date: '2026-09-20', start_time: '09:00' },
      { name: '천마총', visit_date: '2026-09-20', start_time: '10:04' },
      { name: '첨성대', visit_date: '2026-09-20', start_time: '11:13' },
      { name: '교촌마을', visit_date: '2026-09-21', start_time: '09:00' }
    ];
    const moved = reflowStartTimes(moveScheduleItem(day, 0, 1));
    expect(moved.map(item => `${item.name} ${item.start_time}`)).toEqual([
      '천마총 09:00', '대릉원 10:04', '첨성대 11:13', '교촌마을 09:00'
    ]);
  });

  it('leaves untimed stops and unchanged items alone', () => {
    const items = [
      { visit_date: '2026-09-20', start_time: '09:00' },
      { visit_date: '2026-09-20', start_time: null },
      { visit_date: '2026-09-20', start_time: '11:00' }
    ];
    const result = reflowStartTimes(items);
    expect(result[1].start_time).toBeNull();
    expect(result[0]).toBe(items[0]);
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

export type ScheduleWriteItem = { contentId: string; visitDate: string; startTime?: string; stayMinutes?: number; note?: string };

export function isScheduleDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isScheduleItem(item: unknown, start: string, end: string): item is ScheduleWriteItem {
  if (!item || typeof item !== 'object') return false;
  const value = item as Partial<ScheduleWriteItem>;
  return typeof value.contentId === 'string' && Boolean(value.contentId.trim()) && value.contentId.length <= 100 &&
    isScheduleDate(value.visitDate) && value.visitDate >= start && value.visitDate <= end &&
    (value.startTime === undefined || (typeof value.startTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.startTime))) &&
    (value.stayMinutes === undefined || (Number.isInteger(value.stayMinutes) && value.stayMinutes >= 15 && value.stayMinutes <= 240)) &&
    (value.note === undefined || value.note === null || typeof value.note === 'string');
}

export function duplicateScheduleItems(items: ScheduleWriteItem[]) {
  return new Set(items.map(item => `${item.contentId.trim()}:${item.visitDate}`)).size !== items.length;
}

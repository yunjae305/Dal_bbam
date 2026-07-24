export function moveScheduleItem<T>(items: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function dateRange(startDate: string, endDate: string, maxDays = 31): string[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

  const days: string[] = [];
  for (
    let cursor = start;
    cursor <= end && days.length < maxDays;
    cursor = new Date(cursor.getTime() + 86_400_000)
  ) {
    days.push(cursor.toISOString().slice(0, 10));
  }
  return days;
}

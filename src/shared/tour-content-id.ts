/** TourAPI content ids are numeric; the offline sample catalogue uses slugs such as "bulguksa". */
export function isTourApiContentId(contentId: string): boolean {
  return /^\d+$/.test(contentId);
}

/**
 * The production places table still carries a few slug rows copied from the offline sample
 * set (bulguksa, donggung-wolji, ...). Each duplicates a real TourAPI row and opens a sample
 * page, so once real TourAPI rows are present the slugs are dropped. A catalogue made only
 * of slugs (offline development) is returned untouched.
 */
export function withoutSampleSlugs<T>(rows: T[], contentIdOf: (row: T) => string): T[] {
  return rows.some(row => isTourApiContentId(contentIdOf(row)))
    ? rows.filter(row => isTourApiContentId(contentIdOf(row)))
    : rows;
}

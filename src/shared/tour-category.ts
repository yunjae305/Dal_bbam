import codes from '@/shared/tour-category-codes.json';
import type { PlaceCategory } from '@/shared/types';

/** TourAPI content types alone cannot distinguish historic sites from nature. */
export function tourCategory(contentType: string, cat1 = '', cat2 = ''): PlaceCategory {
  const type = codes.contentType as Record<string, PlaceCategory>;
  if (contentType !== '12') return type[contentType] ?? 'attraction';
  return (codes.cat2 as Record<string, PlaceCategory>)[cat2]
    ?? (codes.cat1 as Record<string, PlaceCategory>)[cat1]
    ?? 'attraction';
}

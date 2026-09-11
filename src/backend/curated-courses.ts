import { placeCategories, type PlaceCategory, type TransportMode } from '@/shared/types';
import { isUuid } from '@/backend/http';

export type CuratedCourseInput = {
  id?: string; title: string; description: string; transport: TransportMode; theme: PlaceCategory;
  stops: Array<{ contentId: string; reason: string; stayMinutes: number }>;
};

export function parseCuratedCourse(input: unknown, editing = false): CuratedCourseInput | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as CuratedCourseInput;
  if (editing && !isUuid(value.id)) return null;
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 80 ||
    typeof value.description !== 'string' || value.description.length > 2000 ||
    !['walking', 'car', 'public'].includes(value.transport) || !placeCategories.includes(value.theme) ||
    !Array.isArray(value.stops) || !value.stops.length || value.stops.length > 20) return null;
  if (value.stops.some(stop => !stop || typeof stop.contentId !== 'string' || !stop.contentId.trim() || stop.contentId.length > 100 ||
    typeof stop.reason !== 'string' || stop.reason.length > 500 || !Number.isInteger(stop.stayMinutes) || stop.stayMinutes < 15 || stop.stayMinutes > 240)) return null;
  const stops = value.stops.map(stop => ({ ...stop, contentId: stop.contentId.trim(), reason: stop.reason.trim() }));
  if (new Set(stops.map(stop => stop.contentId)).size !== stops.length) return null;
  return { ...value, title: value.title.trim(), description: value.description.trim(), stops };
}

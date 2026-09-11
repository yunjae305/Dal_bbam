import { describe, expect, it, vi } from 'vitest';
import { readOfflinePlaces } from '@/frontend/offline-places';

function storage(entries: Array<[string, unknown, string?]>) {
  return { keys: async () => ['unrelated-app', 'gyeongju-travel-public-v5'], open: vi.fn(async () => ({
    keys: async () => entries.map(([url]) => new Request(`https://example.com${url}`)),
    match: async (request: Request) => {
      const entry = entries.find(([url]) => request.url.endsWith(url));
      return entry ? Response.json({ data: entry[1] }, { headers: { 'Cache-Control': entry[2] || 'public' } }) : undefined;
    }
  })) } as unknown as CacheStorage;
}

describe('offline public place information', () => {
  it('merges list and detailed information in the requested language', async () => {
    const cache = storage([
      ['/api/places?lang=en', [{ contentId: '1', name: 'Observatory', description: 'Summary' }]],
      ['/api/places/1?lang=en', { contentId: '1', name: 'Observatory', overview: 'Historic site', openingHours: '09:00–18:00', phone: '123' }],
      ['/api/places/2?lang=ko', { contentId: '2', name: '한국어 장소' }]
    ]);
    const places = await readOfflinePlaces(cache, 'en');
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ name: 'Observatory', overview: 'Historic site', openingHours: '09:00–18:00' });
    expect(cache.open).toHaveBeenCalledTimes(1);
  });
  it('ignores personal data, private responses and malformed older entries', async () => {
    const places = await readOfflinePlaces(storage([
      ['/api/home/personalized?lang=ko', [{ contentId: 'secret', name: 'Secret' }]],
      ['/api/schedules?lang=ko', [{ contentId: 'trip', name: 'Private trip' }]],
      ['/api/places/1?lang=ko', { contentId: '1', name: 'Private' }, 'private, no-store'],
      ['/api/places?lang=ko', [{ bad: true }, { contentId: '2', name: 'Public' }]]
    ]), 'ko');
    expect(places.map(place => place.contentId)).toEqual(['2']);
  });
});

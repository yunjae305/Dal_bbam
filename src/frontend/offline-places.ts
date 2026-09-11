import type { Lang, PlaceDetail, PlaceSummary } from '@/shared/types';

export type OfflinePlace = Pick<PlaceSummary, 'contentId' | 'name' | 'address' | 'description'> & Partial<Pick<PlaceDetail, 'overview' | 'openingHours' | 'phone'>>;

/** Only public API caches are read; private saved trips are never persisted here. */
export async function readOfflinePlaces(storage: CacheStorage, locale: Lang): Promise<OfflinePlace[]> {
  const places = new Map<string, OfflinePlace>();
  const keys = (await storage.keys()).filter(key => key.startsWith('gyeongju-travel-public-'));
  for (const key of keys) {
    const cache = await storage.open(key);
    const requests = (await cache.keys()).filter(request => {
      const url = new URL(request.url);
      return /^\/api\/places(?:\/[^/]+)?$/.test(url.pathname)
        && (url.searchParams.get('lang') || 'ko') === locale;
    }).sort((a, b) => new URL(a.url).pathname.length - new URL(b.url).pathname.length);
    for (const request of requests) {
      try {
        const response = await cache.match(request);
        if (!response?.ok || /private|no-store/i.test(response.headers.get('cache-control') || '')) continue;
        const payload = await response.json();
        const entries: unknown[] = Array.isArray(payload.data) ? payload.data : [payload.data];
        for (const entry of entries) {
          if (!entry || typeof entry !== 'object') continue;
          const item = entry as Record<string, unknown>;
          if (typeof item.contentId !== 'string' || typeof item.name !== 'string') continue;
          const text = (field: string) => typeof item[field] === 'string' ? item[field] as string : '';
          places.set(item.contentId, {
            contentId: item.contentId, name: item.name, address: text('address'), description: text('description'),
            overview: text('overview'), openingHours: text('openingHours'), phone: text('phone')
          });
        }
      } catch { /* An evicted or outdated entry must not hide other cached places. */ }
    }
  }
  return [...places.values()].slice(0, 50);
}

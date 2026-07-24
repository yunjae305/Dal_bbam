'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Category, Place, PlaceCategory } from '@/shared/types';
import { placeCategories } from '@/shared/types';
import { KakaoMapExplorer } from '@/frontend/components/travel/kakao-map-explorer';
import { useLocale } from '@/frontend/i18n/locale-context';

export function MapPageScreen({ places }: { places: Place[] }) {
  const { messages } = useLocale();
  const searchParams = useSearchParams();
  const requestedCategory = searchParams.get('category');
  const initialCategory: Category = placeCategories.includes(requestedCategory as PlaceCategory)
    ? requestedCategory as PlaceCategory
    : 'all';
  const [selectedId, setSelectedId] = useState(places[0]?.contentId ?? '');
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [category, setCategory] = useState<Category>(initialCategory);
  const [nearbyPlaces, setNearbyPlaces] = useState<Place[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const allPlaces = useMemo(() => Array.from(
    new Map([...nearbyPlaces, ...places].map(place => [place.contentId, place])).values()
  ), [nearbyPlaces, places]);
  const visible = useMemo(() => allPlaces.filter(place => {
    const matchesCategory = category === 'all' || place.category === category;
    const q = query.trim().toLowerCase();
    return matchesCategory && (!q || [place.name, place.description, place.address, ...place.tags].join(' ').toLowerCase().includes(q));
  }), [allPlaces, query, category]);
  const selected = visible.find(place => place.contentId === selectedId) ?? visible[0];

  return (
    <section className="grid min-h-[calc(100dvh-112px)] md:grid-cols-[380px_1fr]">
      <aside className="order-2 max-h-[45dvh] overflow-y-auto bg-[#faf8f4] p-4 md:order-1 md:max-h-[calc(100dvh-112px)] md:p-5">
        <h1 className="text-xl font-black">{messages.map.title}</h1>
        {(nearbyLoading || nearbyPlaces.length > 0) && (
          <p className="mt-2 rounded-lg bg-[#e8f2ed] px-3 py-2 text-[10px] font-bold text-[#2f7567]" role="status">
            {nearbyLoading
              ? messages.map.nearbyLoading
              : messages.map.nearbyCount.replace('{count}', String(nearbyPlaces.length))}
          </p>
        )}
        <label className="mt-4 flex h-11 items-center gap-2 rounded-xl bg-white px-3 shadow-sm ring-1 ring-black/5">
          <Search size={16} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder={messages.common.searchPlaceholder} className="min-w-0 flex-1 bg-transparent text-[11px] outline-none" />
        </label>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => setCategory('all')} className={`shrink-0 rounded-full px-3 py-2 text-[9px] font-black ${category === 'all' ? 'bg-[#b94f4a] text-white' : 'bg-white'}`}>{messages.common.all}</button>
          {placeCategories.map(item => <button key={item} type="button" onClick={() => setCategory(item)} className={`shrink-0 rounded-full px-3 py-2 text-[9px] font-black ${category === item ? 'bg-[#b94f4a] text-white' : 'bg-white'}`}>{messages.categories[item as PlaceCategory]}</button>)}
        </div>
        <div className="mt-4 space-y-2">
          {visible.map(place => (
            <article key={place.contentId} className={`grid grid-cols-[72px_1fr] gap-3 rounded-xl p-2 ${selected?.contentId === place.contentId ? 'bg-[#fff0eb] ring-1 ring-[#b94f4a]/30' : 'bg-white'}`}>
              <button type="button" onClick={() => setSelectedId(place.contentId)} aria-label={`${place.name} 지도에서 선택`} className="text-left">
                <img src={place.image} alt={place.name} className="h-16 w-[72px] rounded-lg object-cover" />
              </button>
              <div className="min-w-0">
                <button type="button" onClick={() => setSelectedId(place.contentId)} className="block w-full text-left">
                  <strong className="block truncate text-[12px]">{place.name}</strong>
                  <span className="mt-1 block truncate text-[9px] text-[#76807d]">{messages.categories[place.category]} · {place.address}</span>
                </button>
                <Link href={`/places/${encodeURIComponent(place.contentId)}`} className="mt-2 inline-block text-[9px] font-black text-[#b94f4a]">상세 보기 →</Link>
              </div>
            </article>
          ))}
        </div>
      </aside>
      <div className="relative order-1 min-h-[55dvh] md:order-2 md:min-h-0">
        <KakaoMapExplorer
          places={visible}
          selectedPlace={selected}
          onSelect={place => setSelectedId(place.contentId)}
          onNearbyPlaces={next => {
            setNearbyPlaces(next);
            setSelectedId(next[0]?.contentId ?? selectedId);
          }}
          onNearbyLoading={setNearbyLoading}
        />
      </div>
    </section>
  );
}

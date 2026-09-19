'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MapPin, Navigation, RotateCw, Search } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { Category, Place, PlaceCategory } from '@/shared/types';
import { placeCategories } from '@/shared/types';
import {
  KakaoMapExplorer,
  type MapBounds,
  type MapPlace
} from '@/frontend/components/travel/kakao-map-explorer';
import { useLocale } from '@/frontend/i18n/locale-context';
import { exploreMessages } from '@/shared/explore-messages';
import { sortPlacesByRelevance } from '@/shared/place-search';

type KakaoPlaceResult = {
  id: string;
  name: string;
  categoryName: string;
  categoryGroupCode: string;
  categoryGroupName: string;
  phone: string;
  address: string;
  roadAddress: string;
  lat: number;
  lng: number;
  placeUrl: string;
  distanceMeters: number | null;
};

const kakaoCategory: Record<Category, string> = {
  all: 'AT4',
  heritage: 'AT4',
  attraction: 'AT4',
  food: 'FD6',
  lodging: 'AD5',
  festival: 'AT4',
  nature: 'AT4',
  experience: 'AT4'
};

function placeCategory(result: KakaoPlaceResult): PlaceCategory {
  if (result.categoryGroupCode === 'FD6' || result.categoryName.includes('음식')) return 'food';
  if (result.categoryGroupCode === 'AD5' || result.categoryName.includes('숙박')) return 'lodging';
  if (/(?:문화유적|유적지|문화재|고궁|고분|왕릉|사찰|박물관)/.test(result.categoryName)) return 'heritage';
  if (/(?:자연|국립공원|도립공원|해수욕장|해변|수목원|식물원|산림|휴양림|호수|폭포)/.test(result.categoryName)) return 'nature';
  if (/(?:축제|페스티벌)/.test(result.categoryName)) return 'festival';
  if (/(?:체험|레포츠|수상레저)/.test(result.categoryName)) return 'experience';
  return 'attraction';
}

/**
 * Kakao results keep their own wording. Forcing them into the app's seven
 * categories labelled a forklift dealer "관광지"; the provider's own leaf
 * category ("지게차수리") tells the traveler what the place actually is.
 */
function kakaoCategoryLabel(place: MapPlace): string | null {
  if (!place.kakaoPlaceId) return null;
  return place.tags.at(-1) ?? null;
}

function toMapPlace(result: KakaoPlaceResult): MapPlace {
  const address = result.roadAddress || result.address;
  return {
    id: `kakao:${result.id}`,
    contentId: `kakao:${result.id}`,
    category: placeCategory(result),
    name: result.name,
    description: result.categoryName,
    address,
    distance: result.distanceMeters === null ? '' : `${Math.max(1, Math.round(result.distanceMeters))}m`,
    rating: 0,
    bestTime: '',
    image: '/icon.svg',
    tags: result.categoryName.split('>').map(value => value.trim()).filter(Boolean),
    coordinates: [result.lat, result.lng],
    translations: {},
    kakaoPlaceId: result.id,
    kakaoPlaceUrl: result.placeUrl
  };
}

export function MapPageScreen({ places }: { places: Place[] }) {
  const { locale, messages } = useLocale();
  const ui = exploreMessages[locale];
  const searchParams = useSearchParams();
  const requestedCategory = searchParams.get('category');
  const initialCategory: Category = placeCategories.includes(requestedCategory as PlaceCategory)
    ? requestedCategory as PlaceCategory
    : 'all';
  // 지도 앱처럼 처음에는 아무 장소도 고르지 않은 상태로 시작한다.
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [category, setCategory] = useState<Category>(initialCategory);
  const [nearbyPlaces, setNearbyPlaces] = useState<Place[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [kakaoPlaces, setKakaoPlaces] = useState<MapPlace[]>([]);
  const [kakaoLoading, setKakaoLoading] = useState(false);
  const [kakaoError, setKakaoError] = useState('');
  const [sheet, setSheet] = useState<'peek' | 'half' | 'full'>('half');
  const [routeOpen, setRouteOpen] = useState(false);
  // 길찾기 화면이 뜨면 이 화면의 검색·목록은 물러난다.
  const [routeView, setRouteView] = useState(false);

  const allPlaces = useMemo(() => Array.from(
    new Map([...kakaoPlaces, ...nearbyPlaces, ...places].map(place => [place.contentId, place as MapPlace])).values()
  ), [kakaoPlaces, nearbyPlaces, places]);
  const visible = useMemo(() => sortPlacesByRelevance(allPlaces.filter(place => {
    const matchesCategory = category === 'all' || place.category === category;
    const q = query.trim().toLowerCase();
    return matchesCategory && (!q || [place.name, place.description, place.address, ...place.tags].join(' ').toLowerCase().includes(q));
  }), query), [allPlaces, query, category]);
  const selected = visible.find(place => place.contentId === selectedId);
  const hasSelection = Boolean(selected);

  const searchKakao = useCallback(async (
    bounds?: MapBounds,
    nextCategory: Category = category,
    nextQuery: string = query
  ) => {
    const params = new URLSearchParams({ size: '15' });
    const keyword = nextQuery.trim();
    if (keyword) params.set('query', keyword);
    if (!keyword || nextCategory !== 'all') params.set('category', kakaoCategory[nextCategory]);
    if (bounds) {
      params.set('south', String(bounds.south));
      params.set('west', String(bounds.west));
      params.set('north', String(bounds.north));
      params.set('east', String(bounds.east));
    }

    setKakaoLoading(true);
    setKakaoError('');
    try {
      const response = await fetch(`/api/maps/places?${params}`, { cache: 'no-store' });
      const payload = await response.json() as {
        data?: { places?: KakaoPlaceResult[] };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(payload.error?.message ?? messages.map.kakaoSearchFailed);
      // AT4 is a broad tourist-attraction group, not evidence for the selected
      // heritage/nature/festival layer. Keep only provider-classified matches.
      const next = (payload.data?.places ?? []).map(toMapPlace)
        .filter(place => nextCategory === 'all' || place.category === nextCategory);
      // 결과는 목록으로 보여 주고, 카드는 사용자가 고른 장소에만 띄운다.
      setKakaoPlaces(next);
    } catch (error) {
      setKakaoError(error instanceof Error ? error.message : messages.map.kakaoSearchFailed);
    } finally {
      setKakaoLoading(false);
    }
  }, [category, messages.map.kakaoSearchFailed, query]);


  const chooseCategory = useCallback((next: Category) => {
    setCategory(next);
    setKakaoPlaces([]);
    void searchKakao(undefined, next);
  }, [searchKakao]);

  // 카카오맵처럼 지도를 화면에 깔고, 목록은 끌어올리는 시트에 담는다.
  const sheetHeights = { peek: 104, half: 380, full: 620 } as const;
  const sheetHeight = Math.min(sheetHeights[sheet], typeof window === 'undefined' ? sheetHeights[sheet] : Math.round(window.innerHeight * 0.72));
  const nextSheet = () => setSheet(current => (current === 'peek' ? 'half' : current === 'half' ? 'full' : 'peek'));
  const statusLine = kakaoError
    || (kakaoLoading ? messages.map.kakaoSearching : '')
    || (nearbyLoading ? messages.map.nearbyLoading : '')
    || (kakaoPlaces.length ? messages.map.kakaoCount.replace('{count}', String(kakaoPlaces.length)) : '')
    || (nearbyPlaces.length ? messages.map.nearbyCount.replace('{count}', String(nearbyPlaces.length)) : '');

  return (
    <section className="relative h-[calc(100dvh-112px)] overflow-hidden bg-[#e8f0e3]">
      <div className="absolute inset-0">
        <KakaoMapExplorer
          places={visible}
          selectedPlace={selected}
          bottomOffset={sheetHeight}
          routeOpen={routeOpen}
          onCloseRoute={() => { setRouteOpen(false); setSheet('half'); }}
          onRouteViewChange={setRouteView}
          onDismissPlace={() => setSelectedId('')}
          onSelect={place => setSelectedId(place.contentId)}
          onNearbyPlaces={next => {
            setNearbyPlaces(next);
            if (next[0]) setSelectedId(next[0].contentId);
          }}
          onNearbyLoading={setNearbyLoading}
          onSearchArea={bounds => searchKakao(bounds)}
          searchAreaLoading={kakaoLoading}
        />
      </div>

      {!routeView && <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 px-3 pt-3">
        <form
          className="pointer-events-auto flex h-12 items-center gap-2 rounded-2xl bg-white px-4 shadow-[0_6px_20px_rgba(18,55,47,.18)]"
          onSubmit={event => {
            event.preventDefault();
            void searchKakao();
          }}
        >
          <Search size={17} className="text-[#2f7567]" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={messages.common.searchPlaceholder}
            aria-label={messages.common.searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-[12px] outline-none"
          />
          <button type="submit" disabled={kakaoLoading} aria-label={messages.map.kakaoSearch} className="grid h-9 w-9 place-items-center rounded-full bg-[#2f7567] text-white disabled:opacity-60">
            {kakaoLoading ? <RotateCw className="animate-spin" size={15} /> : <Search size={15} />}
          </button>
        </form>

        <div className="pointer-events-auto flex justify-end">
          <button
            type="button"
            aria-pressed={routeOpen}
            onClick={() => { setRouteOpen(open => !open); setSheet(open => (open === 'peek' ? 'half' : 'peek')); }}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[11px] font-black shadow-[0_6px_16px_rgba(18,55,47,.18)] ${routeOpen ? 'bg-[#b94f4a] text-white' : 'bg-white text-[#2f7567]'}`}
          >
            <Navigation size={14} /> {messages.map.directions}
          </button>
        </div>

        <div className="pointer-events-auto flex gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => chooseCategory('all')} className={`inline-flex min-h-10 shrink-0 items-center rounded-full px-3.5 text-[10px] font-black shadow-sm ${category === 'all' ? 'bg-[#b94f4a] text-white' : 'bg-white text-[#25211d]'}`}>{messages.common.all}</button>
          {placeCategories.map(item => (
            <button key={item} type="button" onClick={() => chooseCategory(item)} className={`inline-flex min-h-10 shrink-0 items-center rounded-full px-3.5 text-[10px] font-black shadow-sm ${category === item ? 'bg-[#b94f4a] text-white' : 'bg-white text-[#25211d]'}`}>
              {messages.categories[item]}
            </button>
          ))}
        </div>
      </div>}

      {!routeView && !hasSelection && <div
        style={{ height: sheetHeight }}
        className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[22px] bg-[#faf8f4] shadow-[0_-8px_28px_rgba(18,55,47,.16)] transition-[height] duration-200 motion-reduce:transition-none"
      >
        <button
          type="button"
          onClick={nextSheet}
          aria-label={messages.map.toggleList}
          aria-expanded={sheet !== 'peek'}
          className="flex shrink-0 flex-col items-center gap-1 px-4 pb-1 pt-2"
        >
          <span aria-hidden="true" className="h-1.5 w-12 rounded-full bg-[#d8d1c7]" />
          <span className="flex w-full items-baseline justify-between">
            <strong className="text-[13px] font-black">{messages.map.title}</strong>
            <span className="text-[10px] font-bold text-[#6f7a75]">{statusLine || messages.map.listCount.replace('{count}', String(visible.length))}</span>
          </span>
        </button>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
          {visible.map(place => (
            <article key={place.contentId} className={`grid grid-cols-[72px_1fr] gap-3 rounded-xl p-2 ${selected?.contentId === place.contentId ? 'bg-[#fff0eb] ring-1 ring-[#b94f4a]/30' : 'bg-white'}`}>
              <button type="button" onClick={() => setSelectedId(place.contentId)} aria-label={ui.selectOnMap.replace('{name}', place.name)} className="text-left">
                {place.kakaoPlaceId ? (
                  <span className="grid h-16 w-[72px] place-items-center rounded-lg bg-[#e8f2ed] text-[#2f7567]">
                    <MapPin size={25} />
                  </span>
                ) : (
                  <img src={place.image} alt={place.name} loading="lazy" width={72} height={64} className="h-16 w-[72px] rounded-lg object-cover" />
                )}
              </button>
              <div className="min-w-0">
                <button type="button" onClick={() => setSelectedId(place.contentId)} className="block w-full text-left">
                  <strong className="block truncate text-[12px]">{place.name}</strong>
                  <span className="mt-1 block truncate text-[9px] text-[#76807d]">{kakaoCategoryLabel(place) ?? messages.categories[place.category]} · {place.address}</span>
                </button>
                {place.kakaoPlaceUrl ? (
                  <a href={place.kakaoPlaceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[9px] font-black text-[#2f7567]">{messages.map.kakaoDetail} →</a>
                ) : (
                  <Link href={`/places/${encodeURIComponent(place.contentId)}`} className="mt-2 inline-block text-[9px] font-black text-[#b94f4a]">{ui.detail} →</Link>
                )}
              </div>
            </article>
          ))}
          {!visible.length && <p className="py-6 text-center text-[10px] text-[#76807d]">{messages.common.empty}</p>}
        </div>
      </div>}
    </section>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Home,
  MapPin,
  Search,
  Settings2,
  X
} from 'lucide-react';
import type { Category, MvpData, Place, PlaceCategory, PlaceSummary } from '@/shared/types';
import { PhoneStatus } from '@/frontend/components/common/ui';
import { EmptyState } from '@/frontend/components/common/feedback';
import { DirectPageShell } from '@/frontend/components/common/direct-page-shell';
import { useLocale } from '@/frontend/i18n/locale-context';
import { KakaoMapExplorer } from './travel/kakao-map-explorer';

type HomePanel = 'main' | 'all';
type MapFilter = Category;
type PersonalizedRecommendation = { place: Place; reasonCategory: PlaceCategory | null };
type HomeCategory = {
  id: 'ai' | 'transport' | 'food' | 'festival' | 'map' | 'shorts' | 'community' | 'all';
  icon: string;
  filter?: MapFilter;
  href?: string;
  panel?: HomePanel;
};

const mapFilters: MapFilter[] = ['all', 'attraction', 'food', 'lodging', 'heritage'];
const homeHeroImage = '/assets/home/images/경주-야경-사진.jpg';
const homeCategories: HomeCategory[] = [
  { id: 'ai', icon: '/assets/home/icons/카테고리-AI추천.png', href: '/courses' },
  { id: 'transport', icon: '/assets/home/icons/카테고리-교통.png', href: '/map' },
  { id: 'food', icon: '/assets/home/icons/카테고리-음식.png', filter: 'food' },
  { id: 'festival', icon: '/assets/home/icons/카테고리-축제.png', filter: 'festival' },
  { id: 'map', icon: '/assets/home/icons/카테고리-지도.png', filter: 'all' },
  { id: 'shorts', icon: '/assets/home/icons/카테고리-쇼츠.png', href: '/shorts' },
  { id: 'community', icon: '/assets/home/icons/카테고리-커뮤니티.png', href: '/community' },
  { id: 'all', icon: '/assets/home/icons/카테고리-전체보기.png', panel: 'all' }
];

export function TravelMvpApp({ initialData, userEmail }: { initialData: MvpData; userEmail?: string | null }) {
  const router = useRouter();
  const { locale } = useLocale();
  const [homePanel, setHomePanel] = useState<HomePanel>('main');
  const [query, setQuery] = useState('');
  const [recentPlaceId, setRecentPlaceId] = useState('');
  const [popularPlaces, setPopularPlaces] = useState(initialData.places.slice(0, 3));
  const [personalized, setPersonalized] = useState<PersonalizedRecommendation[]>([]);

  useEffect(() => {
    try {
      const recent = JSON.parse(window.localStorage.getItem('dal-bbam-recent-places') || '[]') as string[];
      setRecentPlaceId(recent[0] ?? '');
    } catch {
      window.localStorage.removeItem('dal-bbam-recent-places');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/home?lang=${locale}`, { signal: controller.signal })
      .then(async response => {
        const payload = await response.json() as { data?: { popular?: PlaceSummary[] } };
        if (!response.ok || !payload.data?.popular) return;
        const initialById = new Map(initialData.places.map(place => [place.contentId, place]));
        setPopularPlaces(payload.data.popular.slice(0, 3).map(summary =>
          initialById.get(summary.contentId) ?? summaryToPlace(summary)
        ));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [initialData.places, locale]);

  useEffect(() => {
    if (!userEmail) return;
    const controller = new AbortController();
    fetch(`/api/home/personalized?lang=${locale}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) return;
        const payload = await response.json() as {
          data?: { recommendations?: Array<PlaceSummary & { reasonCategory: PlaceCategory | null }> };
        };
        const recommendations = payload.data?.recommendations;
        if (!recommendations?.length) return;
        const initialById = new Map(initialData.places.map(place => [place.contentId, place]));
        setPersonalized(recommendations.slice(0, 2).map(({ reasonCategory, ...summary }) => ({
          place: initialById.get(summary.contentId) ?? summaryToPlace(summary),
          reasonCategory
        })));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [initialData.places, locale, userEmail]);

  function openMap(filter: MapFilter, searchQuery = '') {
    const params = new URLSearchParams();
    if (filter !== 'all') params.set('category', filter);
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    router.push(`/map${params.size ? `?${params}` : ''}`);
  }

  return (
    <DirectPageShell>
      <div className="relative mx-auto min-h-[calc(100dvh-48px)] w-full max-w-[430px] overflow-hidden bg-[#f7f7f7]">
          {homePanel === 'main' && (
            <HomeScreen
              places={initialData.places}
              popularPlaces={popularPlaces}
              query={query}
              setQuery={setQuery}
              onSearch={() => openMap('all', query)}
              onCategory={filter => openMap(filter)}
              onOpenAll={() => setHomePanel('all')}
              onOpenPlace={contentId => router.push(`/places/${encodeURIComponent(contentId)}`)}
              recentPlace={initialData.places.find(place => place.contentId === recentPlaceId)}
              personalized={personalized}
              userName={userEmail ? userEmail.split('@')[0] : null}
            />
          )}
          {homePanel === 'all' && (
            <HomeAllScreen
              onClose={() => setHomePanel('main')}
              onCategory={filter => openMap(filter)}
              onOpenStamp={() => router.push('/stamps')}
            />
          )}
      </div>
    </DirectPageShell>
  );
}

function summaryToPlace(summary: PlaceSummary): Place {
  return {
    id: summary.contentId,
    contentId: summary.contentId,
    category: summary.category,
    name: summary.name,
    description: summary.description,
    address: summary.address,
    distance: summary.distanceMeters ? `${summary.distanceMeters}m` : '경주',
    rating: summary.rating ?? 0,
    bestTime: '',
    image: summary.imageUrl,
    tags: summary.tags,
    coordinates: summary.coordinates,
    translations: {},
    source: summary.source
  };
}


function HomeScreen({
  places,
  popularPlaces,
  query,
  setQuery,
  onSearch,
  onCategory,
  onOpenAll,
  onOpenPlace,
  recentPlace,
  personalized,
  userName
}: {
  places: Place[];
  popularPlaces: Place[];
  query: string;
  setQuery: (query: string) => void;
  onSearch: () => void;
  onCategory: (filter: MapFilter) => void;
  onOpenAll: () => void;
  onOpenPlace: (contentId: string) => void;
  recentPlace?: Place;
  personalized: PersonalizedRecommendation[];
  userName?: string | null;
}) {
  const { messages } = useLocale();

  const labelForHomeCategory = (id: string) => {
    if (id === 'ai') return messages.home.aiRecommendation;
    if (id === 'transport') return messages.home.transportation;
    if (id === 'map') return messages.nav.map;
    if (id === 'shorts') return messages.home.shorts;
    if (id === 'community') return messages.home.community;
    if (id === 'all') return messages.common.viewAll;
    return messages.categories[id as keyof typeof messages.categories];
  };

  return (
    <section className="min-h-[calc(100dvh-40px)] bg-[#f5f1ea]">
      <div className="relative min-h-[284px] bg-[#2d2a26] text-white">
        <img
          className="absolute inset-0 h-full w-full object-cover outline outline-1 -outline-offset-1 outline-black/10"
          src={homeHeroImage}
          alt=""
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.2)_48%,rgba(0,0,0,.46))]" />
        <div className="relative z-10">
          <PhoneStatus dark />
          <div className="px-6 pt-8">
            <p className="text-[11px] font-bold text-white/85">{messages.home.eyebrow}</p>
            <h1 className="mt-1 max-w-[190px] text-balance text-[18px] font-black leading-[1.25]">
              {messages.home.headline}🌙
            </h1>
          </div>
        </div>

        <form
          className="absolute inset-x-8 bottom-[76px] z-20 flex h-9 items-center gap-2 rounded-full bg-white/92 px-4 text-[#2d2925] shadow-[0_8px_24px_rgba(0,0,0,.24)]"
          onSubmit={event => {
            event.preventDefault();
            onSearch();
          }}
        >
          <img
            src="/assets/common/icons/검색.png"
            alt=""
            aria-hidden="true"
            className="h-[15px] w-[15px] object-contain"
          />
          <input
            className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold outline-none placeholder:text-[#817b73]"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={messages.common.searchPlaceholder}
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label={messages.common.clearSearch}>
              <X size={15} />
            </button>
          ) : (
            <Settings2 size={15} />
          )}
        </form>

      </div>

      <div className="relative z-20 mx-10 -mt-14 rounded-xl bg-[#eee9df]/95 px-4 py-3 shadow-[0_10px_28px_rgba(0,0,0,.28)]">
        <div className="grid grid-cols-4 gap-y-3">
            {homeCategories.map(({ id, icon, filter, href, panel }) => (
              <button
                key={id}
                className="flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-bold text-[#25211d] transition-transform active:scale-[0.96]"
                type="button"
                onClick={() => {
                  if (panel === 'all') {
                    onOpenAll();
                  } else if (filter) {
                    onCategory(filter);
                  } else if (href) {
                    window.location.href = href;
                  }
                }}
              >
                <img src={icon} alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
                {labelForHomeCategory(id)}
              </button>
            ))}
        </div>
      </div>

      <div className="px-5 pt-6">
        <SectionHeader title={messages.home.today} action={`${messages.common.viewAll} >`} onAction={onOpenAll} />
        <div className="grid grid-cols-3 gap-4 px-4">
          {popularPlaces.map(place => (
            <button key={place.id} className="text-center" onClick={() => onOpenPlace(place.contentId)} type="button">
              <span className="block aspect-square rounded-lg bg-[#d8d8d8]">
                <img className="h-full w-full rounded-lg object-cover opacity-80" src={place.image} alt={place.name} />
              </span>
              <span className="mt-3 block truncate text-[11px] font-bold">{place.name}</span>
            </button>
          ))}
        </div>

        {recentPlace && (
          <button type="button" onClick={() => { window.location.href = `/places/${encodeURIComponent(recentPlace.contentId)}`; }} className="mx-1 mt-5 flex w-[calc(100%-8px)] items-center gap-3 rounded-xl bg-[#223c72] p-3 text-left text-white">
            <img src={recentPlace.image} alt={recentPlace.name} className="h-12 w-14 rounded-lg object-cover" />
            <span className="min-w-0">
              <span className="block text-[9px] font-black text-white/60">{messages.home.recentPlace}</span>
              <strong className="mt-1 block truncate text-[12px]">{recentPlace.name}</strong>
            </span>
          </button>
        )}

        <Divider />
        {personalized.length > 0 ? (
          <>
            <SectionHeader
              title={messages.home.personalized.replace('{name}', userName ?? '')}
              action={`${messages.common.viewAll} >`}
              onAction={onOpenAll}
            />
            <p className="mb-4 px-1 text-[10px] font-bold text-[#8f8677]">{messages.home.personalizedHint}</p>
            <div className="space-y-5 px-3">
              {personalized.map(({ place, reasonCategory }) => (
                <button
                  key={place.contentId}
                  type="button"
                  className="block w-full text-left"
                  onClick={() => onOpenPlace(place.contentId)}
                >
                  <span className="block h-[118px] overflow-hidden rounded-lg bg-[#d8d8d8]">
                    <img className="h-full w-full object-cover" src={place.image} alt={place.name} />
                  </span>
                  <span className="mt-3 flex items-center gap-2">
                    <span className="truncate text-[11px] font-bold">{place.name}</span>
                    {reasonCategory && (
                      <span className="shrink-0 rounded-full bg-[#eee9df] px-2 py-0.5 text-[9px] font-black text-[#7a6f5d]">
                        #{messages.categories[reasonCategory]}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <SectionHeader title={messages.home.themes} action={`${messages.common.viewAll} >`} onAction={() => { window.location.href = '/courses'; }} />
            <p className="mb-4 px-1 text-[10px] font-bold text-[#8f8677]">{messages.home.themeHint}</p>
            <div className="space-y-5 px-3">
              <CoursePreview image={places[0]?.image} title={messages.home.themeNight} href="/courses" />
              <CoursePreview image={places[1]?.image} title={messages.home.themeFood} href="/courses?interest=food" />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function HomeAllScreen({
  onClose,
  onCategory,
  onOpenStamp
}: {
  onClose: () => void;
  onCategory: (filter: MapFilter) => void;
  onOpenStamp: () => void;
}) {
  const { messages } = useLocale();
  const categoryLabel = (id: string) => {
    if (id === 'ai') return messages.home.aiRecommendation;
    if (id === 'transport') return messages.home.transportation;
    if (id === 'map') return messages.nav.map;
    if (id === 'shorts') return messages.home.shorts;
    if (id === 'community') return messages.home.community;
    return messages.categories[id as keyof typeof messages.categories];
  };

  return (
    <section className="absolute inset-0 z-50 bg-black/42 px-4 pt-[250px] backdrop-blur-[2px]">
      <button className="absolute inset-0 cursor-default" type="button" aria-label={messages.common.close} onClick={onClose} />
      <div className="relative w-full rounded-[28px] bg-[#fbfaf8] px-5 pb-5 pt-4 shadow-[0_18px_46px_rgba(0,0,0,.28)]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#d8d1c7]" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-black tracking-[-0.03em]">{messages.common.viewAll}</h1>
            <p className="mt-1 text-[11px] font-bold text-[#8f98a6]">{messages.home.allHint}</p>
          </div>
          <button className="grid h-10 w-10 place-items-center rounded-full bg-[#f1f2f4] transition-transform active:scale-[0.96]" type="button" onClick={onClose} aria-label={messages.common.close}>
            <img src="/assets/common/icons/닫기.png" alt="" aria-hidden="true" className="h-4 w-4 object-contain opacity-55" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-3">
          {homeCategories.filter(item => item.id !== 'all').map(({ id, icon, filter, href }) => (
            <button
              key={id}
              className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-white text-[10px] font-black text-[#25211d] shadow-sm ring-1 ring-black/5 transition-transform active:scale-[0.96]"
              type="button"
              onClick={() => {
                if (filter) {
                  onCategory(filter);
                } else if (href) {
                  window.location.href = href;
                }
              }}
            >
              <img src={icon} alt="" aria-hidden="true" className="h-8 w-8 object-contain" />
              {categoryLabel(id)}
            </button>
          ))}
          <button
            className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-white text-[10px] font-black text-[#25211d] shadow-sm ring-1 ring-black/5 transition-transform active:scale-[0.96]"
            type="button"
            onClick={onOpenStamp}
          >
            <Check size={22} strokeWidth={2} />
            {messages.home.stamps}
          </button>
        </div>
      </div>
    </section>
  );
}

function MapScreen({
  places,
  selectedPlace,
  query,
  setQuery,
  activeFilter,
  onFilter,
  onSelect
}: {
  places: Place[];
  selectedPlace: Place;
  query: string;
  setQuery: (query: string) => void;
  activeFilter: MapFilter;
  onFilter: (filter: MapFilter) => void;
  onSelect: (place: Place) => void;
}) {
  const { messages } = useLocale();
  const isCategoryList = activeFilter !== 'all';

  return (
    <section className="relative min-h-[calc(100dvh-40px)] bg-[#e9efe5]">
      <KakaoMapExplorer places={places} selectedPlace={selectedPlace} onSelect={onSelect} />
      <div className="absolute inset-x-0 top-0 z-20">
        <PhoneStatus />
        <div className="mx-5 mt-1 flex h-9 items-center gap-2 rounded-full bg-white px-4 shadow-sm">
          <Search size={15} />
          <input
            className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold outline-none placeholder:text-[#817b73]"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={messages.common.searchPlaceholder}
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="검색어 지우기">
              <X size={15} />
            </button>
          ) : (
            <Settings2 size={15} />
          )}
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto px-5 pb-2">
          {mapFilters.map(filter => (
            <button
              key={filter}
              className={`h-8 shrink-0 rounded-full px-4 text-[11px] font-bold ${activeFilter === filter ? 'bg-[#b2504b] text-white' : 'bg-white text-[#6f6962]'}`}
              type="button"
              onClick={() => onFilter(filter)}
            >
              {filter === 'all' ? messages.common.all : messages.categories[filter]}
            </button>
          ))}
          <button className="h-8 shrink-0 rounded-full bg-white px-3 text-[11px] font-bold text-[#6f6962]" type="button">...</button>
        </div>
      </div>

      {!places.length ? (
        <div className="absolute inset-x-5 bottom-[92px] z-20 rounded-lg bg-[#f4efe6] p-3 shadow-lg">
          <EmptyState />
        </div>
      ) : isCategoryList ? (
        <div className="absolute inset-x-5 bottom-[92px] z-20 overflow-hidden rounded-lg border border-[#cac2b6] bg-[#f4efe6] shadow-lg">
          {places.slice(0, 4).map(place => (
            <button key={place.id} className="flex w-full items-center gap-4 border-b border-[#d8d0c4] p-4 text-left last:border-0" onClick={() => onSelect(place)} type="button">
              <img className="h-14 w-16 rounded-md object-cover" src={place.image} alt="" />
              <span className="text-[15px] font-semibold">{place.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="mb-4 flex items-center justify-between px-1">
      <h2 className="text-[15px] font-bold">{title}</h2>
      {action && (
        <button className="text-[10px] font-semibold text-[#c4877e]" type="button" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}


function CoursePreview({ image, title, href }: { image?: string; title: string; href: string }) {
  return (
    <article>
      <Link href={href} className="block transition-transform active:scale-[0.98]">
        <span className="block h-[118px] overflow-hidden rounded-lg bg-[#d8d8d8]">
          {image && <img className="h-full w-full object-cover opacity-65" src={image} alt="" />}
        </span>
        <span className="mt-3 block text-[11px] font-bold">{title}</span>
      </Link>
    </article>
  );
}

function Divider() {
  return <div className="my-6 h-px bg-[#d8a59c]" />;
}

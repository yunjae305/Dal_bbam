'use client';

import { useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  CircleUserRound,
  Home,
  Landmark,
  Map,
  MapPin,
  MessageCircle,
  PlaySquare,
  Search,
  Settings2,
  Sparkles,
  Utensils,
  X
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Category, MvpData, Place } from '@/shared/types';
import { StampTourScreen } from './travel/stamp-tour-screen';
import { AiCourseScreen } from './travel/ai-course-screen';
import { TravelCartScreen } from './travel/travel-cart-screen';
import { ItineraryScreen } from './travel/itinerary-screen';
import { PhoneStatus, MapPattern } from '@/frontend/components/common/ui';
import { BottomNavigation, type NavigationItem } from '@/frontend/components/common/bottom-navigation';
import { EmptyState } from '@/frontend/components/common/feedback';
import { LocaleSwitcher } from '@/frontend/components/common/locale-switcher';
import { useLocale } from '@/frontend/i18n/locale-context';

type TabId = 'home' | 'course' | 'map' | 'calendar' | 'my';
type HomePanel = 'main' | 'all' | 'stamp';
type MapFilter = '전체' | '관광지' | '맛집' | '숙박' | '문화재';

const mapFilters: MapFilter[] = ['전체', '관광지', '맛집', '숙박', '문화재'];
const homeHeroImage = 'https://commons.wikimedia.org/wiki/Special:FilePath/Water_reflection_of_Donggung_Palace_in_Wolji_Pond_at_blue_hour_in_Gyeongju_South_Korea.jpg';
const homeCategories: Array<{ label: string; icon: LucideIcon; filter?: MapFilter; panel?: HomePanel }> = [
  { label: '관광지', icon: Landmark, filter: '관광지' },
  { label: '맛집', icon: Utensils, filter: '맛집' },
  { label: '체험', icon: Sparkles },
  { label: '축제', icon: CalendarDays },
  { label: '지도', icon: Map, filter: '전체' },
  { label: '쇼츠', icon: PlaySquare },
  { label: '커뮤니티', icon: MessageCircle },
  { label: '전체보기', icon: CircleUserRound, panel: 'all' }
];

function filterToCategory(filter: MapFilter): Category {
  if (filter === '맛집') return '음식점';
  if (filter === '숙박') return '숙박';
  if (filter === '관광지' || filter === '문화재') return '문화재';
  return '전체';
}

export function TravelMvpApp({ initialData, userEmail }: { initialData: MvpData; userEmail?: string | null }) {
  const { messages } = useLocale();
  const [tab, setTab] = useState<TabId>('home');
  const [homePanel, setHomePanel] = useState<HomePanel>('main');
  const [query, setQuery] = useState('');
  const [mapFilter, setMapFilter] = useState<MapFilter>('전체');
  const [selectedPlaceId, setSelectedPlaceId] = useState(initialData.places[0]?.id ?? '');

  const selectedPlace = initialData.places.find(place => place.id === selectedPlaceId) ?? initialData.places[0];
  const visiblePlaces = useMemo(() => {
    const category = filterToCategory(mapFilter);
    const normalizedQuery = query.trim().toLowerCase();

    return initialData.places.filter(place => {
      const categoryMatches = category === '전체' || place.category === category;
      const queryMatches = !normalizedQuery ||
        [place.name, place.description, place.address, ...place.tags].join(' ').toLowerCase().includes(normalizedQuery);

      return categoryMatches && queryMatches;
    });
  }, [initialData.places, mapFilter, query]);

  const screenLabel = tab === 'home'
    ? homePanel === 'stamp' ? '스탬프 투어' : '홈 카테고리'
    : tab === 'course'
      ? 'AI 추천 코스'
      : tab === 'map'
        ? mapFilter === '전체' ? '지도-기본' : '지도-카테고리 선택 시'
        : tab === 'calendar'
          ? '일정 상세'
          : '여행 장바구니';

  const navigationItems: NavigationItem<TabId>[] = [
    { id: 'home', label: messages.home, icon: Home },
    { id: 'course', label: messages.course, icon: Sparkles },
    { id: 'map', label: messages.map, icon: MapPin, center: true },
    { id: 'calendar', label: messages.schedule, icon: CalendarDays },
    { id: 'my', label: messages.my, icon: CircleUserRound }
  ];

  return (
    <main className="min-h-dvh bg-[#1f1f1f] text-[#1f252f]">
      <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-[#f7f7f7]">
        <div className="flex min-h-12 items-center justify-between gap-3 bg-[#1f1f1f] px-5 py-2 text-[13px] font-bold text-white/45">
          <span className="truncate">{screenLabel}</span>
          <LocaleSwitcher />
        </div>
        <div className="relative min-h-[calc(100dvh-48px)] overflow-hidden bg-[#f7f7f7] pb-[calc(72px+env(safe-area-inset-bottom))]">
          {tab === 'home' && homePanel !== 'stamp' && (
            <HomeScreen
              places={initialData.places}
              query={query}
              setQuery={setQuery}
              onSearch={() => {
                setMapFilter('전체');
                setTab('map');
              }}
              onCategory={filter => {
                setMapFilter(filter);
                setTab('map');
              }}
              onOpenAll={() => setHomePanel('all')}
            />
          )}
          {tab === 'home' && homePanel === 'all' && (
            <HomeAllScreen
              onClose={() => setHomePanel('main')}
              onCategory={filter => {
                setMapFilter(filter);
                setHomePanel('main');
                setTab('map');
              }}
              onOpenStamp={() => setHomePanel('stamp')}
            />
          )}
          {tab === 'home' && homePanel === 'stamp' && (
            <StampTourScreen places={initialData.places} onBack={() => setHomePanel('all')} onExplore={() => setTab('course')} />
          )}
          {tab === 'course' && <AiCourseScreen places={initialData.places} />}
          {tab === 'map' && (
            <MapScreen
              places={visiblePlaces}
              selectedPlace={selectedPlace}
              query={query}
              setQuery={setQuery}
              activeFilter={mapFilter}
              onFilter={filter => {
                setMapFilter(filter);
                setSelectedPlaceId(initialData.places[0]?.id ?? '');
              }}
              onSelect={place => setSelectedPlaceId(place.id)}
            />
          )}
          {tab === 'calendar' && <ItineraryScreen places={initialData.places} />}
          {tab === 'my' && <TravelCartScreen places={initialData.places} userEmail={userEmail} />}

          <BottomNavigation
            items={navigationItems}
            current={tab}
            onChange={nextTab => {
              setTab(nextTab);
              if (nextTab === 'home') {
                setHomePanel('main');
              }
            }}
          />
        </div>
      </div>
    </main>
  );
}


function HomeScreen({
  places,
  query,
  setQuery,
  onSearch,
  onCategory,
  onOpenAll
}: {
  places: Place[];
  query: string;
  setQuery: (query: string) => void;
  onSearch: () => void;
  onCategory: (filter: MapFilter) => void;
  onOpenAll: () => void;
}) {
  return (
    <section className="min-h-[calc(100dvh-40px)] bg-[#f5f1ea]">
      <div className="relative min-h-[284px] bg-[#2d2a26] text-white">
        <img
          className="absolute inset-0 h-full w-full object-cover"
          src={homeHeroImage}
          alt=""
          onError={event => { event.currentTarget.src = '/login-spring-bg.png'; }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.2)_48%,rgba(0,0,0,.46))]" />
        <div className="relative z-10">
          <PhoneStatus dark />
          <div className="px-6 pt-8">
            <p className="text-[11px] font-bold text-white/85">경주, 신라와 달밤</p>
            <h1 className="mt-1 max-w-[190px] text-[18px] font-black leading-[1.25]">
              특별한 하루를<br />시작해볼까요?🌙
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
          <Search size={15} />
          <input
            className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold outline-none placeholder:text-[#817b73]"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="어디로 떠나볼까요?"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="검색어 지우기">
              <X size={15} />
            </button>
          ) : (
            <Settings2 size={15} />
          )}
        </form>

        <div className="absolute inset-x-10 bottom-[-56px] z-20 rounded-xl bg-[#eee9df]/95 px-4 py-3 shadow-[0_10px_28px_rgba(0,0,0,.28)]">
          <div className="grid grid-cols-4 gap-y-3">
            {homeCategories.map(({ label, icon: Icon, filter, panel }) => (
              <button
                key={label}
                className="flex flex-col items-center gap-1 text-[10px] font-bold text-[#25211d]"
                type="button"
                onClick={() => {
                  if (panel === 'all') {
                    onOpenAll();
                  } else if (filter) {
                    onCategory(filter);
                  }
                }}
              >
                <Icon size={21} strokeWidth={1.8} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 pt-[72px]">
        <SectionHeader title="오늘의 추천" action="전체보기 >" onAction={onOpenAll} />
        <div className="grid grid-cols-3 gap-4 px-4">
          {places.slice(0, 3).map(place => (
            <button key={place.id} className="text-center" onClick={() => onCategory('전체')} type="button">
              <span className="block aspect-square rounded-lg bg-[#d8d8d8]">
                <img className="h-full w-full rounded-lg object-cover opacity-80" src={place.image} alt="" />
              </span>
              <span className="mt-3 block truncate text-[11px] font-bold">{place.name}</span>
            </button>
          ))}
        </div>

        <Divider />
        <SectionHeader title="테마 코스 추천" action="전체보기 >" onAction={onOpenAll} />
        <div className="space-y-5 px-3">
          <CoursePreview image={places[0]?.image} title="OO님, 이런 야경 산책 코스 어때요?" />
          <CoursePreview image={places[1]?.image} title="맛집 추천 코스" />
        </div>
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
  return (
    <section className="absolute inset-0 z-50 bg-black/42 px-4 pt-[250px] backdrop-blur-[2px]">
      <button className="absolute inset-0 cursor-default" type="button" aria-label="전체보기 닫기" onClick={onClose} />
      <div className="relative w-full rounded-[28px] bg-[#fbfaf8] px-5 pb-5 pt-4 shadow-[0_18px_46px_rgba(0,0,0,.28)]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#d8d1c7]" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-black tracking-[-0.03em]">전체보기</h1>
            <p className="mt-1 text-[11px] font-bold text-[#8f98a6]">카테고리와 투어를 선택해 이동하세요.</p>
          </div>
          <button className="grid h-8 w-8 place-items-center rounded-full bg-[#f1f2f4] text-[#69707c]" type="button" onClick={onClose} aria-label="닫기">
            <X size={17} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-3">
          {homeCategories.filter(item => item.label !== '전체보기').map(({ label, icon: Icon, filter }) => (
            <button
              key={label}
              className="flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-white text-[10px] font-black text-[#25211d] shadow-sm ring-1 ring-black/5"
              type="button"
              onClick={() => {
                if (filter) {
                  onCategory(filter);
                }
              }}
            >
              <Icon size={22} strokeWidth={1.8} />
              {label}
            </button>
          ))}
          <button
            className="flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-white text-[10px] font-black text-[#25211d] shadow-sm ring-1 ring-black/5"
            type="button"
            onClick={onOpenStamp}
          >
            <Check size={22} strokeWidth={2} />
            스탬프 투어
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
  const isCategoryList = activeFilter !== '전체';

  return (
    <section className="relative min-h-[calc(100dvh-40px)] bg-[#e9efe5]">
      <MapCanvas places={places} selectedPlace={selectedPlace} onSelect={onSelect} />
      <div className="absolute inset-x-0 top-0 z-20">
        <PhoneStatus />
        <div className="mx-5 mt-1 flex h-9 items-center gap-2 rounded-full bg-white px-4 shadow-sm">
          <Search size={15} />
          <input
            className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold outline-none placeholder:text-[#817b73]"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="어디로 떠나볼까요?"
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
              {filter}
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
      ) : (
        <div className="absolute inset-x-5 bottom-[92px] z-20 rounded-lg border border-[#cac2b6] bg-[#f4efe6] p-4 shadow-lg">
          <div className="mb-3 flex gap-2 text-[10px] font-bold text-[#74706b]">
            <span>{selectedPlace.category}</span>
            <span>{selectedPlace.tags[0]}</span>
          </div>
          <div className="grid grid-cols-[1fr_112px] items-end gap-4">
            <h2 className="pb-3 text-[17px] font-semibold">{selectedPlace.name}</h2>
            <img className="h-24 rounded-md object-cover" src={selectedPlace.image} alt="" />
          </div>
        </div>
      )}
    </section>
  );
}

function MapCanvas({ places, selectedPlace, onSelect }: { places: Place[]; selectedPlace: Place; onSelect: (place: Place) => void }) {
  const markerPositions = [['54%', '45%'], ['28%', '54%'], ['70%', '36%'], ['46%', '66%'], ['66%', '58%']];

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#e8f0e3]">
      <MapPattern />
      {places.slice(0, 5).map((place, index) => {
        const [left, top] = markerPositions[index] ?? markerPositions[0];
        const selected = place.id === selectedPlace.id;
        return (
          <button key={place.id} className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 ${selected ? 'scale-110' : ''}`} style={{ left, top }} type="button" onClick={() => onSelect(place)} aria-label={place.name}>
            {selected ? (
              <span className="grid h-12 w-12 place-items-center rounded-full border-2 border-white bg-[#ddd1be] shadow-lg">
                <img className="h-9 w-9 rounded-full object-cover" src={place.image} alt="" />
              </span>
            ) : (
              <MapPin size={34} className="fill-[#b2504b] text-[#b2504b] drop-shadow" />
            )}
          </button>
        );
      })}
    </div>
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


function CoursePreview({ image, title }: { image?: string; title: string }) {
  return (
    <article>
      <div className="h-[118px] overflow-hidden rounded-lg bg-[#d8d8d8]">
        {image && <img className="h-full w-full object-cover opacity-65" src={image} alt="" />}
      </div>
      <p className="mt-3 text-[11px] font-bold">{title}</p>
    </article>
  );
}

function Divider() {
  return <div className="my-6 h-px bg-[#d8a59c]" />;
}

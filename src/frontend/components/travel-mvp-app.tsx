'use client';

import { useMemo, useState } from 'react';
import {
  Bed,
  CalendarDays,
  ChevronRight,
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

type TabId = 'home' | 'course' | 'map' | 'calendar' | 'my';
type MapFilter = '전체' | '관광지' | '맛집' | '숙박' | '문화재';

const mapFilters: MapFilter[] = ['전체', '관광지', '맛집', '숙박', '문화재'];
const homeCategories: Array<{ label: string; icon: LucideIcon; filter?: MapFilter }> = [
  { label: '관광지', icon: Landmark, filter: '관광지' },
  { label: '맛집', icon: Utensils, filter: '맛집' },
  { label: '체험', icon: Sparkles },
  { label: '축제', icon: CalendarDays },
  { label: '지도', icon: Map, filter: '전체' },
  { label: '쇼츠', icon: PlaySquare },
  { label: '커뮤니티', icon: MessageCircle },
  { label: '전체보기', icon: CircleUserRound, filter: '전체' }
];

const navItems: Array<[TabId, string, LucideIcon]> = [
  ['home', '홈', Home],
  ['course', '코스', Sparkles],
  ['map', '', MapPin],
  ['calendar', '일정', CalendarDays],
  ['my', '마이', CircleUserRound]
];

function filterToCategory(filter: MapFilter): Category {
  if (filter === '맛집') return '음식점';
  if (filter === '숙박') return '숙박';
  if (filter === '관광지' || filter === '문화재') return '문화재';
  return '전체';
}

export function TravelMvpApp({ initialData, userEmail }: { initialData: MvpData; userEmail?: string | null }) {
  const [tab, setTab] = useState<TabId>('home');
  const [query, setQuery] = useState('');
  const [mapFilter, setMapFilter] = useState<MapFilter>('전체');
  const [selectedPlaceId, setSelectedPlaceId] = useState(initialData.places[0]?.id ?? '');
  const [loggingOut, setLoggingOut] = useState(false);

  const selectedPlace = initialData.places.find(place => place.id === selectedPlaceId) ?? initialData.places[0];
  const visiblePlaces = useMemo(() => {
    const category = filterToCategory(mapFilter);
    const normalizedQuery = query.trim().toLowerCase();

    return initialData.places.filter(place => {
      const categoryMatches = category === '전체' || place.category === category;
      const queryMatches = !normalizedQuery ||
        [place.name, place.description, place.address, ...place.tags]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);

      return categoryMatches && queryMatches;
    });
  }, [initialData.places, mapFilter, query]);

  const screenLabel = tab === 'home'
    ? '홈 카테고리'
    : tab === 'map'
      ? mapFilter === '전체' ? '지도-기본' : '지도-카테고리 선택 시'
      : tab === 'course'
        ? '코스 추천'
        : tab === 'calendar'
          ? '일정'
          : '마이';

  function openMap(filter: MapFilter = '전체') {
    setMapFilter(filter);
    setTab('map');
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#1f1f1f] text-[#241f1c]">
      <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-[#f5f1ea]">
        <div className="bg-[#1f1f1f] px-5 py-3 text-[13px] font-bold text-white/35">{screenLabel}</div>
        <div className="relative min-h-[calc(100dvh-40px)] overflow-hidden bg-[#f5f1ea] pb-[74px]">
          {tab === 'home' && (
            <HomeScreen
              places={initialData.places}
              query={query}
              setQuery={setQuery}
              onSearch={() => openMap('전체')}
              onCategory={openMap}
            />
          )}

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

          {tab === 'course' && <CourseScreen places={initialData.places} />}
          {tab === 'calendar' && <EmptyScreen title="여행 일정을 준비 중이에요" body="선택한 코스를 일정으로 담는 화면입니다." />}
          {tab === 'my' && (
            <MyScreen userEmail={userEmail} loggingOut={loggingOut} onLogout={handleLogout} />
          )}

          <BottomNav current={tab} onChange={setTab} />
        </div>
      </div>
    </main>
  );
}

function PhoneStatus() {
  return (
    <div className="flex h-7 items-center justify-between px-6 text-[10px] font-bold text-black">
      <span>16:04</span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-4 rounded-sm border border-black" />
        <span className="h-2 w-3 rounded-sm bg-black" />
        <span className="h-2 w-2 rounded-full bg-black" />
      </span>
    </div>
  );
}

function HomeScreen({
  places,
  query,
  setQuery,
  onSearch,
  onCategory
}: {
  places: Place[];
  query: string;
  setQuery: (query: string) => void;
  onSearch: () => void;
  onCategory: (filter: MapFilter) => void;
}) {
  const hero = places[0];

  return (
    <section>
      <div className="relative min-h-[284px] bg-[#2d2a26] text-white">
        <img
          className="absolute inset-0 h-full w-full object-cover"
          src={hero.image}
          alt=""
          onError={event => { event.currentTarget.src = '/login-spring-bg.png'; }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.2)_48%,rgba(0,0,0,.46))]" />
        <div className="relative z-10">
          <PhoneStatus />
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
            {homeCategories.map(({ label, icon: Icon, filter }) => (
              <button
                key={label}
                className="flex flex-col items-center gap-1 text-[10px] font-bold text-[#25211d]"
                type="button"
                onClick={() => filter ? onCategory(filter) : undefined}
              >
                <Icon size={21} strokeWidth={1.8} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 pt-[72px]">
        <SectionHeader title="오늘의 추천" action="전체보기 >" />
        <div className="grid grid-cols-3 gap-4 px-4">
          {places.slice(0, 3).map(place => (
            <button key={place.id} className="text-center" onClick={() => onCategory('전체')}>
              <span className="block aspect-square rounded-lg bg-[#d8d8d8]">
                <img className="h-full w-full rounded-lg object-cover opacity-80" src={place.image} alt="" />
              </span>
              <span className="mt-3 block truncate text-[11px] font-bold">{place.name}</span>
            </button>
          ))}
        </div>

        <Divider />
        <SectionHeader title="테마 코스 추천" action="전체보기 >" />
        <div className="space-y-5 px-3">
          <CoursePreview image={places[0]?.image} title="OO님, 이런 야경 산책 코스 어때요?" />
          <CoursePreview image={places[1]?.image} title="맛집 추천 코스" />
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
      <MapCanvas places={places.length ? places : [selectedPlace]} selectedPlace={selectedPlace} onSelect={onSelect} />
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
              className={`h-8 shrink-0 rounded-full px-4 text-[11px] font-bold ${
                activeFilter === filter ? 'bg-[#b2504b] text-white' : 'bg-white text-[#6f6962]'
              }`}
              type="button"
              onClick={() => onFilter(filter)}
            >
              {filter}
            </button>
          ))}
          <button className="h-8 shrink-0 rounded-full bg-white px-3 text-[11px] font-bold text-[#6f6962]" type="button">
            ...
          </button>
        </div>
      </div>

      {isCategoryList ? (
        <div className="absolute inset-x-5 bottom-[92px] z-20 overflow-hidden rounded-lg border border-[#cac2b6] bg-[#f4efe6] shadow-lg">
          {(places.length ? places : [selectedPlace]).slice(0, 4).map(place => (
            <button
              key={place.id}
              className="flex w-full items-center gap-4 border-b border-[#d8d0c4] p-4 text-left last:border-0"
              onClick={() => onSelect(place)}
              type="button"
            >
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
  const markerPositions = [
    ['54%', '45%'],
    ['28%', '54%'],
    ['70%', '36%'],
    ['46%', '66%'],
    ['66%', '58%']
  ];

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#e8f0e3]">
      <div className="absolute inset-0 opacity-90">
        <div className="absolute left-[-14%] top-[4%] h-[120%] w-[44%] rotate-[19deg] bg-[#d9ecda]" />
        <div className="absolute right-[-24%] top-[7%] h-[70%] w-[52%] -rotate-[18deg] bg-[#d5ead7]" />
        <div className="absolute left-[16%] top-0 h-full w-7 rotate-[24deg] bg-white shadow-[0_0_0_2px_#e2d7a8]" />
        <div className="absolute left-[50%] top-[-10%] h-[120%] w-5 -rotate-[34deg] bg-white shadow-[0_0_0_2px_#e2d7a8]" />
        <div className="absolute left-[-8%] top-[40%] h-6 w-[120%] -rotate-[12deg] bg-white shadow-[0_0_0_2px_#e2d7a8]" />
        <div className="absolute left-[-10%] top-[63%] h-5 w-[125%] rotate-[3deg] bg-white shadow-[0_0_0_2px_#e2d7a8]" />
        <div className="absolute left-[23%] top-[23%] h-4 w-[78%] rotate-[35deg] bg-[#f5cd6a]" />
        <div className="absolute left-[8%] top-[78%] h-5 w-[80%] -rotate-[32deg] bg-[#f5cd6a]" />
        <div className="absolute left-[-10%] top-[28%] h-3 w-[120%] rotate-[8deg] bg-[#8fc3f7]" />
        <div className="absolute left-[62%] top-[8%] text-[11px] font-semibold text-[#6b8ea4]">황성강</div>
        <div className="absolute left-[45%] top-[25%] text-[10px] font-semibold text-[#777]">황성공원</div>
      </div>

      {places.slice(0, 5).map((place, index) => {
        const [left, top] = markerPositions[index] ?? markerPositions[0];
        const selected = place.id === selectedPlace.id;

        return (
          <button
            key={place.id}
            className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 ${selected ? 'scale-110' : ''}`}
            style={{ left, top }}
            type="button"
            onClick={() => onSelect(place)}
            aria-label={place.name}
          >
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

function CourseScreen({ places }: { places: Place[] }) {
  return (
    <section className="px-5 py-6">
      <PhoneStatus />
      <SectionHeader title="테마 코스 추천" action="전체보기 >" />
      <div className="space-y-5">
        <CoursePreview image={places[0]?.image} title="경주 달밤 산책 코스" />
        <CoursePreview image={places[1]?.image} title="세계유산 집중 코스" />
        <CoursePreview image={places[2]?.image} title="황리단길 맛집 코스" />
      </div>
    </section>
  );
}

function MyScreen({ userEmail, loggingOut, onLogout }: { userEmail?: string | null; loggingOut: boolean; onLogout: () => void }) {
  return (
    <section className="px-5 py-6">
      <PhoneStatus />
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <p className="text-[12px] font-bold text-[#8f8880]">로그인 계정</p>
        <h1 className="mt-2 text-[18px] font-black">{userEmail ?? '게스트'}</h1>
        {userEmail && (
          <button
            className="mt-5 h-10 w-full rounded-lg bg-[#b2504b] text-[13px] font-bold text-white"
            onClick={onLogout}
            disabled={loggingOut}
            type="button"
          >
            {loggingOut ? '로그아웃 중...' : '로그아웃'}
          </button>
        )}
      </div>
    </section>
  );
}

function EmptyScreen({ title, body }: { title: string; body: string }) {
  return (
    <section className="px-5 py-6">
      <PhoneStatus />
      <div className="mt-20 rounded-xl bg-white p-6 text-center shadow-sm">
        <h1 className="text-[18px] font-black">{title}</h1>
        <p className="mt-3 text-[13px] font-semibold text-[#756f67]">{body}</p>
      </div>
    </section>
  );
}

function SectionHeader({ title, action }: { title: string; action?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between px-1">
      <h2 className="text-[15px] font-bold">{title}</h2>
      {action && <button className="text-[10px] font-semibold text-[#c4877e]" type="button">{action}</button>}
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

function BottomNav({ current, onChange }: { current: TabId; onChange: (tab: TabId) => void }) {
  return (
    <nav className="fixed bottom-2 left-1/2 z-40 grid h-[54px] w-[calc(100%-16px)] max-w-[414px] -translate-x-1/2 grid-cols-5 items-center rounded-md bg-white/95 px-2 shadow-[0_-6px_18px_rgba(0,0,0,.08)] backdrop-blur">
      {navItems.map(([id, label, Icon]) => {
        const isCenter = id === 'map';
        const active = current === id;

        return (
          <button
            key={id}
            className={`flex flex-col items-center justify-center gap-0.5 text-[9px] font-bold ${
              active ? 'text-[#2fa7c7]' : 'text-[#2e2a27]'
            }`}
            type="button"
            onClick={() => onChange(id)}
            aria-label={isCenter ? '지도' : label}
          >
            {isCenter ? (
              <span className="block h-9 w-9 rounded-full bg-[#b94f4a] shadow-sm" />
            ) : (
              <>
                <Icon size={16} strokeWidth={1.8} />
                <span>{label}</span>
              </>
            )}
          </button>
        );
      })}
    </nav>
  );
}

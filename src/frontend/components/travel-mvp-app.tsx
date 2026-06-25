'use client';

import { useMemo, useState } from 'react';
import {
  Bed,
  Bookmark,
  CalendarDays,
  Check,
  ChevronLeft,
  CircleUserRound,
  Clock3,
  Heart,
  Home,
  Landmark,
  LockKeyhole,
  Map,
  MapPin,
  Menu,
  MessageCircle,
  Navigation,
  PlaySquare,
  Plus,
  Search,
  Settings2,
  Share2,
  Sparkles,
  Star,
  Store,
  Utensils,
  X
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Category, MvpData, Place } from '@/shared/types';

type TabId = 'home' | 'course' | 'map' | 'calendar' | 'my';
type HomePanel = 'main' | 'all' | 'stamp';
type MapFilter = '전체' | '관광지' | '맛집' | '숙박' | '문화재';

const mapFilters: MapFilter[] = ['전체', '관광지', '맛집', '숙박', '문화재'];
const courseFilters = ['전체', '야경', '문화유산', '가족', '맛집', '힐링'];
const cartFilters = ['전체 (12)', '야경', '유적', '일정', '산책', '자연'];
const stampLabels = ['동궁과 월지', '첨성대', '대릉원', '불국사', '교촌마을', '황리단길', '석굴암', '불국사', '문무왕릉'];
const homeCategories: Array<{ label: string; icon: LucideIcon; filter?: MapFilter; panel?: HomePanel; tab?: TabId }> = [
  { label: '관광지', icon: Landmark, filter: '관광지' },
  { label: '맛집', icon: Utensils, filter: '맛집' },
  { label: '체험', icon: Sparkles },
  { label: '축제', icon: CalendarDays },
  { label: '지도', icon: Map, filter: '전체' },
  { label: '쇼츠', icon: PlaySquare },
  { label: '커뮤니티', icon: MessageCircle },
  { label: '전체보기', icon: CircleUserRound, panel: 'all' }
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
    ? homePanel === 'stamp' ? '스탬프 투어' : homePanel === 'all' ? '홈 전체보기' : '홈 카테고리'
    : tab === 'course'
      ? 'AI 추천 코스'
      : tab === 'map'
        ? mapFilter === '전체' ? '지도-기본' : '지도-카테고리 선택 시'
        : tab === 'calendar'
          ? '일정 상세'
          : '여행 장바구니';

  return (
    <main className="min-h-dvh bg-[#1f1f1f] text-[#1f252f]">
      <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-[#f7f7f7]">
        <div className="bg-[#1f1f1f] px-5 py-3 text-[13px] font-bold text-white/35">{screenLabel}</div>
        <div className="relative min-h-[calc(100dvh-40px)] overflow-hidden bg-[#f7f7f7] pb-[76px]">
          {tab === 'home' && homePanel === 'main' && (
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
              places={initialData.places}
              onBack={() => setHomePanel('main')}
              onOpenStamp={() => setHomePanel('stamp')}
              onOpenCourse={() => setTab('course')}
              onOpenCart={() => setTab('my')}
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

          <BottomNav
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

function PhoneStatus({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`flex h-7 items-center justify-between px-5 text-[10px] font-bold ${dark ? 'text-white' : 'text-black'}`}>
      <span>16:04</span>
      <span className="flex items-center gap-1">
        <span className={`h-2 w-4 rounded-sm border ${dark ? 'border-white' : 'border-black'}`} />
        <span className={`h-2 w-3 rounded-sm ${dark ? 'bg-white' : 'bg-black'}`} />
        <span className={`h-2 w-2 rounded-full ${dark ? 'bg-white' : 'bg-black'}`} />
      </span>
    </div>
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
  const hero = places[0];

  return (
    <section className="min-h-[calc(100dvh-40px)] bg-[#f5f1ea]">
      <div className="relative min-h-[284px] bg-[#2d2a26] text-white">
        <img
          className="absolute inset-0 h-full w-full object-cover"
          src={hero.image}
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
  places,
  onBack,
  onOpenStamp,
  onOpenCourse,
  onOpenCart
}: {
  places: Place[];
  onBack: () => void;
  onOpenStamp: () => void;
  onOpenCourse: () => void;
  onOpenCart: () => void;
}) {
  return (
    <section className="min-h-[calc(100dvh-40px)] bg-[#fbfaf8]">
      <PhoneStatus />
      <HeaderBar title="전체보기" left={<button type="button" onClick={onBack}><ChevronLeft size={20} /></button>} />
      <div className="px-5">
        <h1 className="mt-4 text-[24px] font-black tracking-[-0.03em]">경주에서 할 일</h1>
        <p className="mt-2 text-[12px] font-bold leading-5 text-[#8f98a6]">추천, 코스, 이벤트를 한곳에서 골라보세요.</p>

        <div className="mt-5 grid gap-3">
          <FeatureRow
            icon={Check}
            title="경주 스탬프 투어"
            body="방문지를 돌며 스탬프와 달밤 포인트를 모아요."
            image={places[0]?.image}
            onClick={onOpenStamp}
          />
          <FeatureRow
            icon={Sparkles}
            title="AI 추천 코스"
            body="취향에 맞는 경주 여행 동선을 추천받아요."
            image={places[1]?.image}
            onClick={onOpenCourse}
          />
          <FeatureRow
            icon={Heart}
            title="여행 장바구니"
            body="찜한 장소를 모아 일정으로 보내요."
            image={places[2]?.image}
            onClick={onOpenCart}
          />
        </div>

        <Divider />
        <SectionHeader title="추천 장소" />
        <div className="grid grid-cols-2 gap-3">
          {places.slice(0, 4).map(place => (
            <CartPlaceCard key={place.id} place={place} picked={false} />
          ))}
        </div>
      </div>
    </section>
  );
}

function StampTourScreen({ places, onExplore, onBack }: { places: Place[]; onExplore: () => void; onBack?: () => void }) {
  return (
    <section className="min-h-[calc(100dvh-40px)] bg-[#fbfaf8] px-5 pt-5">
      {onBack && (
        <button className="mb-3 flex items-center gap-1 text-[12px] font-black text-[#6b7280]" type="button" onClick={onBack}>
          <ChevronLeft size={17} />
          전체보기
        </button>
      )}
      <div className="rounded-[24px] bg-white px-5 pb-5 pt-6 shadow-[0_16px_36px_rgba(18,24,40,.08)]">
        <p className="text-[11px] font-black text-[#ff6f5e]">방문하고 모으는</p>
        <h1 className="mt-1 text-[26px] font-black tracking-[-0.03em] text-[#202631]">경주 스탬프 투어</h1>

        <div className="mt-5 rounded-xl border border-[#f1e4dd] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-bold text-[#606875]">달밤 마스터까지 <span className="text-[#ff6b55]">5곳</span> 남았어요</p>
            <p className="text-[11px] font-bold text-[#9aa1aa]">7 / 12</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#fde5df]">
            <div className="h-full w-[58%] rounded-full bg-[#ff6b55]" />
          </div>
          <div className="mt-4 grid grid-cols-3 text-center">
            <Metric value="7" label="모은 스탬프" />
            <Metric value="580" label="달빛 포인트" />
            <Metric value="3" label="남은 보상" />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-[#fff4ea] px-4 py-3">
          <div>
            <p className="text-[12px] font-black text-[#303642]">스탬프 10개 모으면 달밤 배지</p>
            <p className="mt-1 text-[10px] font-bold text-[#8d7768]">앞으로 3곳만 더 방문하면 돼요</p>
          </div>
          <button className="rounded-full bg-[#ff755f] px-4 py-2 text-[11px] font-black text-white" type="button" onClick={onExplore}>보상 보기</button>
        </div>

        <h2 className="mt-5 text-[17px] font-black tracking-[-0.02em]">경주 스탬프 도감</h2>
        <p className="mt-1 text-[11px] font-bold text-[#8c929c]">방문지의 스탬프를 선택해 관광으로 떠나요</p>

        <div className="mt-4 grid grid-cols-3 gap-x-5 gap-y-4">
          {stampLabels.map((label, index) => {
            const place = places[index % places.length];
            const collected = index < 5;
            return (
              <button key={`${label}-${index}`} className="relative text-center" type="button">
                <span className={`relative mx-auto grid h-[70px] w-[70px] place-items-center overflow-hidden rounded-full border-4 ${collected ? 'border-[#fff2e8]' : 'border-[#ece5db] grayscale'}`}>
                  <img className={`h-full w-full object-cover ${collected ? '' : 'opacity-35'}`} src={place.image} alt="" />
                  {!collected && (
                    <span className="absolute inset-0 grid place-items-center bg-white/45">
                      <LockKeyhole size={18} className="text-[#777]" />
                    </span>
                  )}
                </span>
                {collected && (
                  <span className="absolute right-2 top-12 grid h-5 w-5 place-items-center rounded-full bg-[#ff6958] text-white">
                    <Check size={13} strokeWidth={3} />
                  </span>
                )}
                {index === 5 && <span className="absolute right-3 top-12 rounded-full bg-[#6bcf76] px-1.5 py-0.5 text-[9px] font-black text-white">1/5</span>}
                <span className="mt-2 block truncate text-[10px] font-black text-[#303642]">{label}</span>
                <span className="block text-[9px] font-bold text-[#ff7668]">{collected ? '획득 완료' : '미방문'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AiCourseScreen({ places }: { places: Place[] }) {
  return (
    <section className="min-h-[calc(100dvh-40px)] bg-[#fbfaf8]">
      <PhoneStatus />
      <HeaderBar title="AI 추천 코스" right={<Bookmark size={18} />} />
      <div className="px-5">
        <p className="mt-4 text-[11px] font-black text-[#8d95a1]">AI가 취향에 맞춰</p>
        <h1 className="mt-1 text-[22px] font-black leading-tight tracking-[-0.03em]">경주 여행 코스를 추천해드려요</h1>
        <p className="mt-2 text-[11px] font-semibold leading-5 text-[#9aa1aa]">테마별로 엄선한 코스로<br />완벽한 경주 여행을 즐겨보세요.</p>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {courseFilters.map((filter, index) => (
            <Chip key={filter} active={index === 0}>{filter}</Chip>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {places.map((place, index) => (
            <AiCourseCard key={place.id} place={place} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ItineraryScreen({ places }: { places: Place[] }) {
  return (
    <section className="min-h-[calc(100dvh-40px)] bg-[#fbfaf8]">
      <PhoneStatus />
      <HeaderBar title="경주 2박 3일" subtitle="6/28-30 · 장소 5곳" left={<ChevronLeft size={20} />} right={<div className="flex gap-4"><Bookmark size={18} /><Share2 size={18} /></div>} />
      <div className="px-5">
        <p className="mt-2 text-[11px] font-black text-[#57759d]">전체 여행 경로</p>
        <p className="mt-1 text-[9px] font-bold text-[#99a1ad]">선택한 5곳을 순서대로 연결한 전체 경로예요.</p>
        <RouteMapCard places={places} />

        <div className="mt-4 grid grid-cols-3 gap-2">
          {['Day 1', 'Day 2', 'Day 3'].map((day, index) => (
            <button key={day} className={`h-8 rounded-full text-[11px] font-black ${index === 0 ? 'bg-[#223c72] text-white' : 'bg-[#eff2f6] text-[#8f98a6]'}`} type="button">{day}</button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {places.slice(0, 4).map((place, index) => (
            <TimelineItem key={place.id} place={place} index={index} />
          ))}
          <button className="h-11 w-full rounded-xl border border-dashed border-[#cfd6df] bg-white text-[12px] font-black text-[#43628d]" type="button">+ 장소 추가</button>
        </div>
      </div>
    </section>
  );
}

function TravelCartScreen({ places, userEmail }: { places: Place[]; userEmail?: string | null }) {
  return (
    <section className="min-h-[calc(100dvh-40px)] bg-[#fbfaf8]">
      <PhoneStatus />
      <HeaderBar title="여행 장바구니" left={<ChevronLeft size={20} />} right={<button className="text-[11px] font-black text-[#ff5146]" type="button">편집</button>} />
      <div className="px-5">
        <div className="mt-2 grid grid-cols-[1fr_1fr_1fr_32px] gap-2">
          <button className="h-9 rounded-full bg-[#ff5b4f] text-[11px] font-black text-white" type="button">경주 2박 3일</button>
          <button className="h-9 rounded-full bg-[#f1f2f4] text-[11px] font-bold text-[#8c95a1]" type="button">가을 여행 코스</button>
          <button className="h-9 rounded-full bg-[#f1f2f4] text-[11px] font-bold text-[#8c95a1]" type="button">엄마랑 경주</button>
          <button className="grid h-9 place-items-center rounded-full bg-[#f1f2f4]" type="button"><Plus size={15} /></button>
        </div>

        <MiniCartMap />
        <p className="mt-2 text-[10px] font-bold text-[#9aa1aa]"><MapPin size={12} className="mr-1 inline text-[#ff5b4f]" />저장한 장소 <span className="text-[#ff5b4f]">12곳</span> · 지도에서 보기</p>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {cartFilters.map((filter, index) => (
            <Chip key={filter} active={index === 0}>{filter}</Chip>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          {places.concat(places).slice(0, 6).map((place, index) => (
            <CartPlaceCard key={`${place.id}-${index}`} place={place} picked={index < 4} />
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between pb-2 text-[11px] font-black">
          <span>선택 <b className="text-[#ff5b4f]">5곳</b></span>
          <span className="text-[#8f98a6]">{userEmail ? userEmail.split('@')[0] : '여행자'}님 코스</span>
        </div>
        <button className="fixed bottom-[68px] left-1/2 z-30 h-12 w-[calc(100%-40px)] max-w-[390px] -translate-x-1/2 rounded-xl bg-[#ff5b4f] text-[13px] font-black text-white shadow-[0_12px_24px_rgba(255,91,79,.32)]" type="button">
          선택한 장소 일정으로 보내기
        </button>
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

      {isCategoryList ? (
        <div className="absolute inset-x-5 bottom-[92px] z-20 overflow-hidden rounded-lg border border-[#cac2b6] bg-[#f4efe6] shadow-lg">
          {(places.length ? places : [selectedPlace]).slice(0, 4).map(place => (
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

function MapPattern() {
  return (
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
  );
}

function HeaderBar({ title, subtitle, left, right }: { title: string; subtitle?: string; left?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="grid h-11 grid-cols-[42px_1fr_42px] items-center px-4">
      <div className="text-[#111827]">{left}</div>
      <div className="text-center">
        <h1 className="text-[14px] font-black">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[9px] font-bold text-[#8f98a6]">{subtitle}</p>}
      </div>
      <div className="justify-self-end text-[#111827]">{right}</div>
    </header>
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

function FeatureRow({
  icon: Icon,
  title,
  body,
  image,
  onClick
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  image?: string;
  onClick: () => void;
}) {
  return (
    <button className="grid grid-cols-[44px_1fr_72px] items-center gap-3 rounded-2xl border border-[#edf0f4] bg-white p-3 text-left shadow-sm" type="button" onClick={onClick}>
      <span className="grid h-11 w-11 place-items-center rounded-full bg-[#fff1ec] text-[#ff5b4f]">
        <Icon size={20} />
      </span>
      <span className="min-w-0">
        <strong className="block truncate text-[14px] font-black">{title}</strong>
        <span className="mt-1 block line-clamp-2 text-[10px] font-bold leading-4 text-[#8f98a6]">{body}</span>
      </span>
      {image && <img className="h-14 w-[72px] rounded-xl object-cover" src={image} alt="" />}
    </button>
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

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <strong className="text-[22px] font-black text-[#ff5e4e]">{value}</strong>
      <p className="mt-1 text-[9px] font-bold text-[#8d95a1]">{label}</p>
    </div>
  );
}

function Chip({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <button className={`h-8 shrink-0 rounded-full px-4 text-[11px] font-bold ${active ? 'bg-[#ff5b4f] text-white' : 'bg-[#f1f2f4] text-[#8c95a1]'}`} type="button">
      {children}
    </button>
  );
}

function AiCourseCard({ place, index }: { place: Place; index: number }) {
  const titles = ['가을 야경 코스 🌙', '엄마랑 경주 코스 🌿', '문화유산 집중 코스 🏛️', '맛집 포함 산책 코스 🍴', '힐링 산책 코스'];
  const icons = [Landmark, Utensils, Bed, Store];
  const Icon = icons[index % icons.length];

  return (
    <article className="grid grid-cols-[122px_1fr_22px] gap-3 rounded-xl border border-[#eef0f3] bg-white p-3 shadow-sm">
      <img className="h-[86px] rounded-lg object-cover" src={place.image} alt="" />
      <div className="min-w-0">
        <h2 className="truncate text-[14px] font-black">{titles[index] ?? place.name}</h2>
        <p className="mt-1 truncate text-[10px] font-bold text-[#8f98a6]">{place.name} → 첨성대 → 황리단길 →</p>
        <p className="mt-2 line-clamp-2 text-[10px] font-semibold leading-4 text-[#9aa1aa]">{place.description}</p>
        <div className="mt-2 flex items-center gap-2 text-[9px] font-bold text-[#8f98a6]">
          <span className="inline-flex items-center gap-0.5"><Icon size={11} /> {place.category}</span>
          <span>4곳</span>
          <span className="text-[#4b80d8]">4.8 ({place.rating})</span>
        </div>
      </div>
      <button className="self-start text-[#ff6b5c]" type="button" aria-label="코스 저장"><Bookmark size={17} /></button>
    </article>
  );
}

function RouteMapCard({ places }: { places: Place[] }) {
  return (
    <div className="relative mt-3 h-[162px] overflow-hidden rounded-2xl bg-[#e8f0e3]">
      <MapPattern />
      <div className="absolute inset-0">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 360 162" aria-hidden="true">
          <path d="M76 48 L152 64 L92 94 L206 108 L296 78" fill="none" stroke="#314b84" strokeDasharray="3 4" strokeWidth="2" />
        </svg>
        {[[76, 48], [152, 64], [92, 94], [296, 78], [206, 108]].map(([left, top], index) => (
          <span key={index} className="absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#ff4e45] text-[11px] font-black text-white ring-2 ring-white" style={{ left, top }}>
            {index + 1}
          </span>
        ))}
        <button className="absolute bottom-4 right-4 rounded-full bg-white px-4 py-2 text-[11px] font-black text-[#314b84] shadow" type="button">
          <Navigation size={13} className="mr-1 inline" /> 전체 지도
        </button>
        <span className="absolute left-5 top-5 text-[11px] font-black">{places[0]?.address.split(' ')[0] ?? '경주 시내'}</span>
      </div>
    </div>
  );
}

function TimelineItem({ place, index }: { place: Place; index: number }) {
  const times = ['10:00', '11:30', '13:00', '19:00'];
  return (
    <article className="grid grid-cols-[28px_44px_1fr] items-center gap-3">
      <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-black text-white ${index === 3 ? 'bg-[#ff4e45]' : 'bg-[#223c72]'}`}>{index + 1}</span>
      <span className="text-[10px] font-bold text-[#9aa1aa]">{times[index]}</span>
      <div className="grid grid-cols-[70px_1fr_20px] items-center gap-3 rounded-xl border border-[#edf0f4] bg-white p-2 shadow-sm">
        <img className="h-12 rounded-lg object-cover" src={place.image} alt="" />
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-black">{place.name}</h3>
          <p className="mt-1 truncate text-[10px] font-bold text-[#8f98a6]">{place.tags.slice(0, 2).join(' · ')}</p>
        </div>
        <Menu size={15} className="text-[#c0c5cc]" />
      </div>
    </article>
  );
}

function MiniCartMap() {
  return (
    <div className="relative mt-3 h-[118px] overflow-hidden rounded-xl bg-[#e8f0e3]">
      <MapPattern />
      <button className="absolute right-3 top-3 rounded-full bg-white px-3 py-1.5 text-[9px] font-black text-[#4b80d8]" type="button">지도로 보기</button>
      {[[56, 24], [120, 38], [78, 72], [206, 44], [278, 34], [320, 68], [252, 84]].map(([left, top], index) => (
        <MapPin key={index} size={22} className="absolute -translate-x-1/2 -translate-y-1/2 fill-[#ff4e45] text-[#ff4e45]" style={{ left, top }} />
      ))}
    </div>
  );
}

function CartPlaceCard({ place, picked }: { place: Place; picked: boolean }) {
  return (
    <article className="overflow-hidden rounded-xl border border-[#edf0f4] bg-white shadow-sm">
      <div className="relative h-[84px]">
        <img className="h-full w-full object-cover" src={place.image} alt="" />
        <span className={`absolute left-2 top-2 grid h-5 w-5 place-items-center rounded-full text-white ${picked ? 'bg-[#ff5b4f]' : 'bg-white/85 text-[#ff5b4f]'}`}>
          <Check size={13} strokeWidth={3} />
        </span>
        <button className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-white text-[#ff5b4f]" type="button" aria-label="찜">
          <Heart size={14} fill="currentColor" />
        </button>
      </div>
      <div className="p-2">
        <h3 className="truncate text-[11px] font-black">{place.name}</h3>
        <p className="mt-1 truncate text-[9px] font-bold text-[#8f98a6]">{place.category} · {place.address}</p>
        <div className="mt-2 flex gap-1">
          {place.tags.slice(0, 2).map(tag => (
            <span key={tag} className="rounded-full bg-[#f0f4ee] px-2 py-0.5 text-[8px] font-bold text-[#708070]">{tag}</span>
          ))}
        </div>
      </div>
    </article>
  );
}

function BottomNav({ current, onChange }: { current: TabId; onChange: (tab: TabId) => void }) {
  return (
    <nav className="fixed bottom-2 left-1/2 z-40 grid h-[54px] w-[calc(100%-16px)] max-w-[414px] -translate-x-1/2 grid-cols-5 items-center rounded-md bg-white/95 px-2 shadow-[0_-6px_18px_rgba(0,0,0,.08)] backdrop-blur">
      {navItems.map(([id, label, Icon]) => {
        const isCenter = id === 'map';
        const active = current === id;
        return (
          <button key={id} className={`flex flex-col items-center justify-center gap-0.5 text-[9px] font-bold ${active ? 'text-[#2fa7c7]' : 'text-[#2e2a27]'}`} type="button" onClick={() => onChange(id)} aria-label={isCenter ? '지도' : label}>
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

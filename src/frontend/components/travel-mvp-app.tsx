'use client';

import { useMemo, useState } from 'react';
import {
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Compass,
  Database,
  Home,
  Hotel,
  Landmark,
  Languages,
  Loader2,
  Map,
  MapPin,
  Play,
  Route,
  Search,
  Sparkles,
  Star,
  Utensils,
  Video
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Category, Course, Lang, MvpData, Place, ShortClip } from '@/shared/types';

type TabId = 'home' | 'explore' | 'course' | 'shorts';
type ClipWithPlace = ShortClip & { place?: Place };

const categories: Category[] = ['전체', '문화재', '음식점', '숙박', '축제'];
const languages: Array<[Lang, string]> = [
  ['ko', '한국어'],
  ['en', 'EN'],
  ['ja', '日本語'],
  ['zh', '中文']
];
const interests = ['다국어', '대표 명소', '야경', '세계유산', '음식', '숙박', '쇼츠'];
const navItems: Array<[TabId, string, LucideIcon]> = [
  ['home', '홈', Home],
  ['explore', '탐색', Map],
  ['course', '코스', Route],
  ['shorts', '쇼츠', Video]
];
const categoryIcons: Record<Category, LucideIcon> = {
  전체: Compass,
  문화재: Landmark,
  음식점: Utensils,
  숙박: Hotel,
  축제: CalendarDays
};

export function TravelMvpApp({ initialData, userEmail }: { initialData: MvpData; userEmail?: string | null }) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<TabId>('home');
  const [lang, setLang] = useState<Lang>('ko');
  const [category, setCategory] = useState<Category>('전체');
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[]>(initialData.places);
  const [selectedInterests, setSelectedInterests] = useState<string[]>(['다국어', '대표 명소', '야경']);
  const [recommended, setRecommended] = useState<Course>(initialData.courses[0]);
  const [loading, setLoading] = useState(false);
  const [apiMode, setApiMode] = useState('seed-data');
  const [loggingOut, setLoggingOut] = useState(false);

  const heroPlace = data.places[0];
  const visibleShorts: ClipWithPlace[] = data.shorts.map(short => ({
    ...short,
    place: data.places.find(place => place.id === short.placeId)
  }));
  const featureCards = useMemo(() => data.overview.mvpFeatures.map((feature, index) => {
    const labels = ['Top 1', 'Top 2', 'Top 3'];
    const icons = [Search, Sparkles, Video];
    const Icon = icons[index] ?? CheckCircle2;

    return { feature, label: labels[index], Icon };
  }), [data.overview.mvpFeatures]);

  async function changeLang(nextLang: Lang) {
    setLang(nextLang);
    setLoading(true);

    try {
      const response = await fetch(`/api/app?lang=${nextLang}`);
      const nextData = await response.json() as MvpData;
      setData(nextData);
      setPlaces(nextData.places);
      setRecommended(nextData.courses[0]);
    } finally {
      setLoading(false);
    }
  }

  async function searchPlaces(nextCategory = category) {
    setCategory(nextCategory);
    setTab('explore');
    setLoading(true);

    try {
      const params = new URLSearchParams({
        lang,
        category: nextCategory,
        q: query
      });
      const response = await fetch(`/api/places?${params.toString()}`);
      const result = await response.json() as { items: Place[] };
      setPlaces(result.items);
    } finally {
      setLoading(false);
    }
  }

  function toggleInterest(interest: string) {
    setSelectedInterests(current => (
      current.includes(interest)
        ? current.filter(item => item !== interest)
        : [...current, interest]
    ));
  }

  async function requestRecommendation() {
    setTab('course');
    setLoading(true);

    try {
      const response = await fetch('/api/courses/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          interests: selectedInterests
        })
      });
      const result = await response.json() as { item: Course };
      setRecommended(result.item);
    } finally {
      setLoading(false);
    }
  }

  async function checkSupabaseStatus() {
    const response = await fetch('/api/supabase/status');
    const result = await response.json() as { mode: string };
    setApiMode(result.mode);
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
    <main className="min-h-dvh bg-[#eef3ee] text-[#13221f]">
      <header className="sticky top-0 z-40 border-b border-[#dbe6df] bg-[#f7faf6]/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button className="flex items-center gap-3 text-left" onClick={() => setTab('home')}>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#12372f] text-white">
              <Sparkles size={18} />
            </span>
            <span>
              <strong className="block text-[16px] font-black leading-tight">AI 경주</strong>
              <small className="block text-[11px] font-bold text-[#697672]">History Travel PWA</small>
            </span>
          </button>

          <nav className="hidden items-center rounded-full border border-[#dbe6df] bg-white p-1 md:flex">
            {navItems.map(([id, label, Icon]) => (
              <button className={`flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-black ${tab === id ? 'bg-[#12372f] text-white' : 'text-[#63716c]'}`} key={id} onClick={() => setTab(id)}>
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button className="hidden h-10 items-center gap-2 rounded-full border border-[#dbe6df] bg-white px-4 text-[13px] font-black text-[#12372f] sm:flex" onClick={checkSupabaseStatus}>
              <Database size={15} />
              {apiMode === 'supabase-ready' ? 'Supabase' : 'Seed'}
            </button>
            <label className="flex h-10 items-center gap-1 rounded-full border border-[#dbe6df] bg-white px-3 text-[13px] font-black">
              <Languages size={15} />
              <select className="w-[70px] bg-transparent outline-none" value={lang} onChange={event => changeLang(event.target.value as Lang)}>
                {languages.map(([value, label]) => (
                  <option value={value} key={value}>{label}</option>
                ))}
              </select>
            </label>
            {userEmail && (
              <button
                className="hidden h-10 items-center gap-2 rounded-full border border-[#dbe6df] bg-white px-4 text-[13px] font-black text-[#697672] sm:flex hover:border-red-200 hover:text-red-600 transition-colors"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                {loggingOut ? <Loader2 size={14} className="animate-spin" /> : null}
                로그아웃
              </button>
            )}
          </div>
        </div>
      </header>

      {tab === 'home' && (
        <>
          <section className="relative overflow-hidden bg-[#09221e] text-white">
            <div className="absolute inset-0">
        <img className="h-full w-full object-cover opacity-65" src={heroPlace.image} alt={heroPlace.name} onError={event => { event.currentTarget.src = '/icon.svg'; }} />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,25,22,.96),rgba(5,25,22,.66),rgba(5,25,22,.18))]" />
            </div>
            <div className="relative mx-auto grid min-h-[calc(100dvh-64px)] w-full max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:px-8">
              <div className="max-w-3xl">
                <p className="mb-4 text-[14px] font-black text-white/75">{data.overview.region}</p>
                <h1 className="text-[44px] font-black leading-[1.05] sm:text-[64px] lg:text-[76px]">{data.overview.headline}</h1>
                <p className="mt-6 max-w-2xl text-[16px] font-bold leading-7 text-white/85 sm:text-[18px]">{data.overview.summary}</p>
                <form className="mt-8 grid min-h-[62px] max-w-2xl grid-cols-[24px_1fr_auto] items-center gap-3 rounded-lg bg-white p-2 pl-5 text-[#12372f] shadow-2xl" onSubmit={event => {
                  event.preventDefault();
                  searchPlaces();
                }}>
                  <Search size={21} />
                  <input className="min-w-0 bg-transparent text-[16px] font-black outline-none placeholder:text-[#899691]" value={query} onChange={event => setQuery(event.target.value)} placeholder="문화재, 맛집, 숙박, 축제 검색" />
                  <button className="h-12 rounded-md bg-[#12372f] px-5 text-[14px] font-black text-white">검색</button>
                </form>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {featureCards.map(({ feature, label, Icon }) => (
                  <button className="rounded-lg border border-white/18 bg-white/12 p-5 text-left shadow-xl backdrop-blur transition hover:bg-white/18" key={feature} onClick={() => setTab(label === 'Top 1' ? 'explore' : label === 'Top 2' ? 'course' : 'shorts')}>
                    <span className="mb-8 grid h-12 w-12 place-items-center rounded-full bg-white text-[#12372f]">
                      <Icon size={22} />
                    </span>
                    <b className="block text-[12px] font-black text-[#f0b45f]">{label}</b>
                    <strong className="mt-2 block text-[20px] font-black leading-tight">{feature}</strong>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-[.9fr_1.1fr] lg:px-8">
            <div>
              <SectionTitle title="관광 데이터 탐색" action="전체 보기" onClick={() => searchPlaces('전체')} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 lg:grid-cols-2">
                {categories.map(item => (
                  <CategoryButton key={item} label={item} active={category === item} onClick={() => searchPlaces(item)} />
                ))}
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <CourseCard course={recommended} selected />
              <ShortPreview clip={visibleShorts[0]} onClick={() => setTab('shorts')} />
            </div>
          </section>
        </>
      )}

      {tab === 'explore' && (
        <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <PageTitle icon={MapPin} title="관광 데이터 탐색" body="카테고리, 검색어, 언어를 바꾸면 Route Handler가 관광 데이터 seed를 다시 내려줍니다." />
          <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <aside className="grid content-start gap-4">
              <div className="grid min-h-[56px] grid-cols-[22px_1fr_auto] items-center gap-3 rounded-lg border border-[#dbe6df] bg-white px-3">
                <Search size={18} className="text-[#12372f]" />
                <input className="min-w-0 bg-transparent text-[15px] font-black outline-none placeholder:text-[#8b9894]" value={query} onChange={event => setQuery(event.target.value)} placeholder="장소, 주소, 태그 검색" />
                <button className="rounded-md bg-[#12372f] px-4 py-2 text-[12px] font-black text-white" onClick={() => searchPlaces()}>검색</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {categories.map(item => (
                  <CategoryButton key={item} label={item} active={category === item} onClick={() => searchPlaces(item)} />
                ))}
              </div>
            </aside>
            <div className="grid gap-4">
              <MapPanel places={places} />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {places.map(place => <PlaceCard place={place} key={place.id} />)}
              </div>
            </div>
          </div>
        </section>
      )}

      {tab === 'course' && (
        <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <PageTitle icon={Route} title="AI 맞춤 코스 추천" body="관심사를 선택하면 추천 Route Handler가 가장 맞는 코스를 반환합니다." />
          <div className="grid gap-6 lg:grid-cols-[390px_1fr]">
            <aside className="rounded-lg border border-[#dbe6df] bg-white p-5">
              <h2 className="text-[22px] font-black">관심사 선택</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {interests.map(interest => (
                  <button className={`rounded-full border px-3 py-2 text-[12px] font-black ${selectedInterests.includes(interest) ? 'border-[#12372f] bg-[#12372f] text-white' : 'border-[#dbe6df] bg-white text-[#697672]'}`} key={interest} onClick={() => toggleInterest(interest)}>
                    {interest}
                  </button>
                ))}
              </div>
              <button className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#12372f] text-[14px] font-black text-white" onClick={requestRecommendation}>
                {loading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                코스 추천 받기
              </button>
            </aside>
            <div className="grid gap-4 xl:grid-cols-3">
              <CourseCard course={recommended} selected />
              {data.courses.filter(course => course.id !== recommended.id).map(course => <CourseCard course={course} key={course.id} />)}
            </div>
          </div>
        </section>
      )}

      {tab === 'shorts' && (
        <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <PageTitle icon={Video} title="1분 쇼츠형 다국어 해설" body="문화재와 음식 동선을 짧은 콘텐츠 카드로 먼저 이해하고 현장 탐색으로 이어갑니다." />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleShorts.map(clip => <ShortCard clip={clip} key={clip.id} />)}
          </div>
        </section>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-[#dbe6df] bg-white/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
        {navItems.map(([id, label, Icon]) => (
          <button className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-black ${tab === id ? 'bg-[#e1eee8] text-[#12372f]' : 'text-[#7d8b86]'}`} key={id} onClick={() => setTab(id)}>
            <Icon size={20} />
            {label}
          </button>
        ))}
      </nav>
    </main>
  );
}

function SectionTitle({ title, action, onClick }: { title: string; action?: string; onClick?: () => void }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 className="text-[24px] font-black">{title}</h2>
      {action && (
        <button className="text-[13px] font-black text-[#ba7a24]" onClick={onClick}>
          {action}
        </button>
      )}
    </div>
  );
}

function PageTitle({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="mb-8 flex max-w-3xl gap-4">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[#12372f] text-white">
        <Icon size={23} />
      </span>
      <div>
        <h1 className="text-[32px] font-black leading-tight sm:text-[42px]">{title}</h1>
        <p className="mt-3 text-[15px] font-bold leading-6 text-[#697672]">{body}</p>
      </div>
    </div>
  );
}

function CategoryButton({ label, active, onClick }: { label: Category; active: boolean; onClick: () => void }) {
  const Icon = categoryIcons[label];

  return (
    <button className={`min-h-[104px] rounded-lg border p-4 text-left ${active ? 'border-[#12372f] bg-[#e1eee8]' : 'border-[#dbe6df] bg-white'}`} onClick={onClick}>
      <span className="grid h-10 w-10 place-items-center rounded-full bg-[#f2f6f2] text-[#12372f]">
        <Icon size={20} />
      </span>
      <b className="mt-4 block text-[14px] font-black">{label}</b>
    </button>
  );
}

function MapPanel({ places }: { places: Place[] }) {
  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-lg border border-[#dbe6df] bg-[#e7f0ec] lg:min-h-[460px]">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,55,47,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(18,55,47,.08)_1px,transparent_1px)] bg-[length:42px_42px]" />
      {places.slice(0, 5).map((place, index) => (
        <button className="absolute flex max-w-[190px] items-center gap-2 rounded-full bg-white px-4 py-3 text-[12px] font-black text-[#12372f] shadow-lg" style={{ left: `${10 + index * 16}%`, top: `${18 + (index % 3) * 24}%` }} key={place.id}>
          <MapPin size={16} fill="currentColor" />
          <span className="truncate">{place.name}</span>
        </button>
      ))}
    </div>
  );
}

function PlaceCard({ place }: { place: Place }) {
  return (
    <article className="overflow-hidden rounded-lg border border-[#dbe6df] bg-white">
      <img className="h-44 w-full bg-[#12372f] object-cover" src={place.image} alt={place.name} onError={event => { event.currentTarget.src = '/icon.svg'; }} />
      <div className="p-4">
        <p className="text-[11px] font-black text-[#ba7a24]">{place.category} · {place.distance}</p>
        <h3 className="mt-2 text-[19px] font-black leading-tight">{place.name}</h3>
        <p className="mt-2 line-clamp-3 text-[13px] font-bold leading-5 text-[#697672]">{place.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex h-7 items-center gap-1 rounded-full bg-[#fff4df] px-2 text-[11px] font-black text-[#ba7a24]">
            <Star size={13} fill="currentColor" />
            {place.rating}
          </span>
          <span className="inline-flex h-7 items-center rounded-full bg-[#f2f6f2] px-2 text-[11px] font-black text-[#12372f]">{place.bestTime}</span>
        </div>
      </div>
    </article>
  );
}

function CourseCard({ course, selected }: { course: Course; selected?: boolean }) {
  return (
    <article className={`rounded-lg border bg-white p-5 ${selected ? 'border-[#2f6f9f] shadow-[0_0_0_3px_rgba(47,111,159,.12)]' : 'border-[#dbe6df]'}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#f2f6f2] px-3 py-1 text-[11px] font-black text-[#12372f]">{course.persona}</span>
        {selected && <b className="inline-flex items-center gap-1 text-[11px] font-black text-[#2f6f9f]"><BadgeCheck size={15} /> 추천됨</b>}
      </div>
      <h3 className="mt-4 text-[24px] font-black leading-tight">{course.title}</h3>
      <p className="mt-3 text-[14px] font-bold leading-6 text-[#697672]">{course.description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-[#f2f6f2] px-3 py-1 text-[11px] font-black text-[#12372f]">{course.duration}</span>
        <span className="rounded-full bg-[#f2f6f2] px-3 py-1 text-[11px] font-black text-[#12372f]">{course.transport}</span>
      </div>
      <ol className="mt-5 grid gap-2">
        {course.stops.map(stop => (
          <li className="flex items-center gap-2 text-[13px] font-black" key={stop}>
            <CheckCircle2 size={16} className="text-[#ba7a24]" />
            {stop}
          </li>
        ))}
      </ol>
    </article>
  );
}

function ShortPreview({ clip, onClick }: { clip: ClipWithPlace; onClick: () => void }) {
  return (
    <button className="flex min-h-full w-full items-end gap-4 rounded-lg bg-cover bg-center p-5 text-left text-white" style={{ backgroundImage: `linear-gradient(90deg, rgba(9, 30, 26, .9), rgba(9, 30, 26, .18)), url(${clip.image})` }} onClick={onClick}>
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-[#12372f]">
        <Play size={20} fill="currentColor" />
      </span>
      <span>
        <strong className="block text-[22px] font-black leading-tight">{clip.title}</strong>
        <small className="mt-2 block text-[13px] font-bold leading-5 text-white/80">{clip.caption}</small>
      </span>
    </button>
  );
}

function ShortCard({ clip }: { clip: ClipWithPlace }) {
  return (
    <article className="relative flex min-h-[520px] flex-col justify-between overflow-hidden rounded-lg bg-cover bg-center p-5 text-white" style={{ backgroundImage: `linear-gradient(180deg, rgba(5, 20, 18, .06), rgba(5, 20, 18, .9)), url(${clip.image})` }}>
      <button className="ml-auto grid h-12 w-12 place-items-center rounded-full bg-white text-[#12372f]">
        <Play size={23} fill="currentColor" />
      </button>
      <div>
        <p className="text-[12px] font-black text-white/75">{clip.duration} · {clip.place?.category ?? '관광'}</p>
        <h3 className="mt-2 max-w-[10em] text-[32px] font-black leading-tight">{clip.title}</h3>
        <p className="mt-3 text-[14px] font-bold leading-6 text-white/85">{clip.caption}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {clip.tags.map(tag => (
            <span className="rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[11px] font-black" key={tag}>
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

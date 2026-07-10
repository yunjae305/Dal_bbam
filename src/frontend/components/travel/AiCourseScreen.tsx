'use client';

import React from 'react';
import { Bookmark, Sparkles, Landmark, Utensils, Bed, Store } from 'lucide-react';
import type { Place } from '@/shared/types';

type Props = { places: Place[] };

export function AiCourseScreen({ places }: Props) {
  const courseFilters = ['전체', '야경', '문화유산', '가족', '맛집', '힐링'];
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

'use client';

import React from 'react';
import { ChevronLeft, Plus, MapPin, Bookmark, Search, X, Heart, Check } from 'lucide-react';
import type { Place } from '@/shared/types';

type Props = { places: Place[]; userEmail?: string | null };

export function TravelCartScreen({ places, userEmail }: Props) {
  const cartFilters = ['전체 (12)', '야경', '유적', '일정', '산책', '자연'];
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

n        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {cartFilters.map((filter, index) => (
            <Chip key={filter} active={index === 0}>{filter}</Chip>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          {places.concat(places).slice(0, 6).map((place, index) => (
            <CartPlaceCard key={`${place.id}-${index}`} place={place} picked={index < 4} />
          ))}
        </div>

n        <div className="mt-3 flex items-center justify-between pb-2 text-[11px] font-black">
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

function MiniCartMap() {
  return (
    <div className="relative mt-3 h-[118px] overflow-hidden rounded-xl bg-[#e8f0e3]">
      <div className="absolute inset-0 opacity-90">
        <div className="absolute left-[-14%] top-[4%] h-[120%] w-[44%] rotate-[19deg] bg-[#d9ecda]" />
        <div className="absolute right-[-24%] top-[7%] h-[70%] w-[52%] -rotate-[18deg] bg-[#d5ead7]" />
      </div>
      <button className="absolute right-3 top-3 rounded-full bg-white px-3 py-1.5 text-[9px] font-black text-[#4b80d8]" type="button">지도로 보기</button>
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

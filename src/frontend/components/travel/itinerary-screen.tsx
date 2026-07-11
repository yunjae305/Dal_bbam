'use client';

import React from 'react';
import { ChevronLeft, Bookmark, Share2, Navigation, Menu } from 'lucide-react';
import type { Place } from '@/shared/types';
import { PhoneStatus, HeaderBar, MapPattern } from '@/frontend/components/common/ui';

type Props = { places: Place[] };

export function ItineraryScreen({ places }: Props) {
  return (
    <section className="min-h-[calc(100dvh-40px)] bg-[#fbfaf8]">
      <PhoneStatus />
      <HeaderBar title="경주 2박 3일" subtitle="6/28-30 · 장소 5곳" left={<ChevronLeft size={20} />} right={<div className="flex gap-4"><Bookmark size={18} /><Share2 size={18} /></div>} />
      <div className="px-5">
        <p className="mt-2 text-[11px] font-black text-[#57759d]">전체 여행 경로</p>
        <p className="mt-1 text-[9px] font-bold text-[#99a1ad]">선택한 5곳을 순서대로 연결한 전체 경로예요.</p>
        <RouteMapCard places={places} />

n        <div className="mt-4 grid grid-cols-3 gap-2">
          {['Day 1', 'Day 2', 'Day 3'].map((day, index) => (
            <button key={day} className={`h-8 rounded-full text-[11px] font-black ${index === 0 ? 'bg-[#223c72] text-white' : 'bg-[#eff2f6] text-[#8f98a6]'}`} type="button">{day}</button>
          ))}
        </div>

n        <div className="mt-4 space-y-3">
          {places.slice(0, 4).map((place, index) => (
            <TimelineItem key={place.id} place={place} index={index} />
          ))}
          <button className="h-11 w-full rounded-xl border border-dashed border-[#cfd6df] bg-white text-[12px] font-black text-[#43628d]" type="button" aria-disabled>+ 장소 추가</button>
        </div>
      </div>
    </section>
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
        <span className="absolute left-5 top-5 text-[11px] font-black">{places[0]?.address?.split(' ')[0] ?? '경주 시내'}</span>
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

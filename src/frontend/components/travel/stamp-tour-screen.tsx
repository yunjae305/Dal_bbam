'use client';

import React from 'react';
import { ChevronLeft, Check, LockKeyhole } from 'lucide-react';
import type { Place } from '@/shared/types';
import { PhoneStatus, Metric } from '@/frontend/components/common/ui';

type Props = { places: Place[]; onExplore: () => void; onBack?: () => void };

export function StampTourScreen({ places, onExplore, onBack }: Props) {
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
          {['동궁과 월지','첨성대','대릉원','불국사','교촌마을','황리단길','석굴암','불국사','문무왕릉'].map((label, index) => {
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

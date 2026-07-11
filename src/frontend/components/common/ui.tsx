'use client';

import React from 'react';
import { MapPin } from 'lucide-react';

export function PhoneStatus({ dark = false }: { dark?: boolean }) {
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

export function HeaderBar({ title, subtitle, left, right }: { title: string; subtitle?: string; left?: React.ReactNode; right?: React.ReactNode }) {
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

export function Chip({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <button className={`h-8 shrink-0 rounded-full px-4 text-[11px] font-bold ${active ? 'bg-[#ff5b4f] text-white' : 'bg-[#f1f2f4] text-[#8c95a1]'}`} type="button">
      {children}
    </button>
  );
}

export function MapPattern() {
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

export function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <strong className="text-[22px] font-black text-[#ff5e4e]">{value}</strong>
      <p className="mt-1 text-[9px] font-bold text-[#8d95a1]">{label}</p>
    </div>
  );
}

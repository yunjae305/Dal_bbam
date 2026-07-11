'use client';

import type { LucideIcon } from 'lucide-react';

export type NavigationItem<Id extends string> = { id: Id; label: string; icon: LucideIcon; center?: boolean };

export function BottomNavigation<Id extends string>({ items, current, onChange }: { items: NavigationItem<Id>[]; current: Id; onChange: (id: Id) => void }) {
  return (
    <nav className="fixed bottom-0 left-1/2 z-40 grid min-h-[64px] w-full max-w-[430px] -translate-x-1/2 grid-cols-5 items-center border-t border-[#e7dfd4] bg-[#f5f1ea]/95 px-5 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="주요 메뉴">
      {items.map(({ id, label, icon: Icon, center }) => {
        const active = current === id;
        return <button key={id} type="button" onClick={() => onChange(id)} aria-label={label} aria-current={active ? 'page' : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b94f4a] ${active ? 'text-[#2fa7c7]' : 'text-[#2e2a27]'}`}>{center ? <span className="h-7 w-7 rounded-full bg-[#b94f4a] shadow-sm" aria-hidden="true" /> : <><Icon size={16} strokeWidth={1.8} /><span>{label}</span></>}</button>;
      })}
    </nav>
  );
}

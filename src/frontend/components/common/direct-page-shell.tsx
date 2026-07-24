'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, CircleUserRound, Home, MapPin, Sparkles } from 'lucide-react';
import { LocaleSwitcher } from '@/frontend/components/common/locale-switcher';
import { useLocale } from '@/frontend/i18n/locale-context';

const links = [
  { href: '/', key: 'home', icon: Home },
  { href: '/courses', key: 'course', icon: Sparkles },
  { href: '/map', key: 'map', icon: MapPin },
  { href: '/schedule', key: 'schedule', icon: CalendarDays },
  { href: '/cart', key: 'my', icon: CircleUserRound }
] as const;

export function DirectPageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { messages } = useLocale();
  return (
    <main className="min-h-dvh bg-[#1f1f1f] text-[#1f252f]">
      <div className="mx-auto min-h-dvh w-full max-w-[1200px] bg-[#f7f7f7]">
        <div className="flex min-h-12 items-center justify-between bg-[#1f1f1f] px-5 text-[11px] font-black text-white/70">
          <Link href="/" className="text-white">DAL BBAM · GYEONGJU</Link>
          <LocaleSwitcher />
        </div>
        <div className="pb-[calc(72px+env(safe-area-inset-bottom))]">{children}</div>
        <nav className="fixed bottom-0 left-1/2 z-40 grid min-h-[64px] w-full max-w-[1200px] -translate-x-1/2 grid-cols-5 items-center border-t bg-[#f5f1ea]/95 px-5 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="주요 메뉴">
          {links.map(({ href, key, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-black ${active ? 'text-[#b94f4a]' : 'text-[#484d4b]'}`}>
                <Icon size={17} />
                {messages.nav[key]}
              </Link>
            );
          })}
        </nav>
      </div>
    </main>
  );
}

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { CalendarDays, CircleUserRound, Download, Home, LoaderCircle, LogOut, MapPin, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { LocaleSwitcher } from '@/frontend/components/common/locale-switcher';
import { useLocale } from '@/frontend/i18n/locale-context';
import { pwaMessages } from '@/shared/pwa-messages';

type NavKey = 'home' | 'course' | 'map' | 'schedule' | 'my';
type NavLink = { href: string; key: NavKey; icon: LucideIcon; asset?: string; activeAsset?: string };

const links: NavLink[] = [
  { href: '/', key: 'home', icon: Home, activeAsset: '/assets/common/icons/홈-선택됨.png' },
  { href: '/courses', key: 'course', icon: Sparkles },
  { href: '/map', key: 'map', icon: MapPin },
  { href: '/schedule', key: 'schedule', icon: CalendarDays },
  { href: '/settings', key: 'my', icon: CircleUserRound, asset: '/assets/common/icons/프로필.png' }
];

export function DirectPageShell({ children, publicView = false }: { children: React.ReactNode; publicView?: boolean }) {
  const pathname = usePathname();
  const { locale, messages } = useLocale();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);

  async function logout() {
    setLoggingOut(true);
    setLogoutFailed(false);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('Logout failed');
      window.location.replace('/login');
    } catch {
      setLoggingOut(false);
      setLogoutFailed(true);
    }
  }

  return (
    <main className="min-h-dvh bg-[#1f1f1f] text-[#1f252f]">
      <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-[#f7f7f7]">
        <div className="flex min-h-12 items-center justify-between gap-2 bg-[#1f1f1f] px-4 text-[11px] font-black text-white/70">
          <Link href="/" className="shrink-0 text-white">DAL BBAM</Link>
          <div className="flex min-w-0 items-center gap-1">
            <Link href="/install" aria-label={pwaMessages[locale].title} title={pwaMessages[locale].title} className="grid min-h-11 min-w-11 place-items-center rounded-full text-white/80"><Download size={17} /></Link>
            <LocaleSwitcher />
            {!publicView && <button
              type="button"
              onClick={() => void logout()}
              disabled={loggingOut}
              className="flex min-h-9 shrink-0 items-center gap-1 rounded-full px-2 text-white/70 transition-transform active:scale-[0.96] disabled:opacity-60"
              aria-label={messages.common.logout}
              title={messages.common.logout}
            >
              {loggingOut ? <LoaderCircle size={14} className="animate-spin" /> : <LogOut size={14} />}
            </button>}
          </div>
        </div>
        {logoutFailed && <p role="alert" className="px-4 py-3 text-sm text-red-800">{messages.common.logout} · {messages.common.retry}</p>}
        <div className={publicView ? 'pb-8' : 'pb-[calc(72px+env(safe-area-inset-bottom))]'}>{children}</div>
        {!publicView && <nav className="fixed bottom-0 left-1/2 z-40 grid min-h-[64px] w-full max-w-[430px] -translate-x-1/2 grid-cols-5 items-center border-t bg-[#f5f1ea]/95 px-5 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label={messages.common.mainMenu}>
          {links.map(({ href, key, icon: Icon, asset, activeAsset }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            const iconAsset = active ? activeAsset ?? asset : asset;
            return (
              <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-black transition-transform active:scale-[0.96] ${active ? 'text-[#b94f4a]' : 'text-[#484d4b]'}`}>
                {iconAsset ? (
                  <Image src={encodeURI(iconAsset)} width={18} height={18} alt="" aria-hidden="true" className="h-[18px] w-[18px] object-contain" />
                ) : (
                  <Icon size={17} />
                )}
                {messages.nav[key]}
              </Link>
            );
          })}
        </nav>}
      </div>
    </main>
  );
}

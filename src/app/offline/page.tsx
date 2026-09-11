'use client';

import Link from 'next/link';
import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocale } from '@/frontend/i18n/locale-context';
import { uiMessages } from '@/shared/ui-messages';
import { exploreMessages } from '@/shared/explore-messages';
import { readOfflinePlaces, type OfflinePlace } from '@/frontend/offline-places';
import { LocaleSwitcher } from '@/frontend/components/common/locale-switcher';

export default function OfflinePage() {
  const { locale } = useLocale();
  const ui = uiMessages[locale].offline;
  const copy = exploreMessages[locale];
  const placeUi = uiMessages[locale].place;
  const [places, setPlaces] = useState<OfflinePlace[]>([]);
  useEffect(() => {
    let active = true;
    if ('caches' in window) {
      void readOfflinePlaces(window.caches, locale).then(items => { if (active) setPlaces(items); }).catch(() => { if (active) setPlaces([]); });
    }
    return () => { active = false; };
  }, [locale]);
  return (
    <main className="grid min-h-dvh place-items-center bg-[#eef3ee] px-5 text-[#202725]">
      <section className="my-6 w-full max-w-[520px] rounded-[28px] bg-white p-7 text-center shadow-[0_18px_60px_rgba(19,55,47,0.12)]">
        <div className="mb-5 flex justify-center"><div className="rounded-full bg-[#12372f] p-1"><LocaleSwitcher /></div></div>
        <WifiOff className="mx-auto text-[#2f7567]" size={42} />
        <h1 className="mt-5 text-balance text-2xl font-black">{ui.title}</h1>
        <p className="mt-3 text-pretty text-sm leading-6 text-[#65706c]">{ui.description}</p>
        <Link href="/" className="mt-6 flex min-h-11 items-center justify-center rounded-xl bg-[#12372f] font-bold text-white transition-transform active:scale-[0.96]">{ui.retry}</Link>
        <div className="mt-7 text-left">
          <h2 className="text-lg font-bold">{copy.offlinePlaces}</h2>
          <p className="mt-2 text-sm text-[#65706c]">{places.length ? copy.offlineSaved : copy.offlineEmpty}</p>
          {places.map(place => <details key={place.contentId} className="mt-3 rounded-xl border border-[#dde5e0] px-4 py-3">
            <summary className="min-h-11 cursor-pointer font-bold">{place.name}</summary>
            <p className="text-sm text-[#65706c]">{place.address}</p>
            <p className="mt-3 whitespace-pre-line text-sm leading-6">{place.overview || place.description}</p>
            {place.openingHours && <p className="mt-3 text-sm">{placeUi.hours}: {place.openingHours}</p>}
            {place.phone && <p className="mt-2 text-sm">{placeUi.phone}: {place.phone}</p>}
          </details>)}
        </div>
      </section>
    </main>
  );
}

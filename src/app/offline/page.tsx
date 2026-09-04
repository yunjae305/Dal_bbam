'use client';

import Link from 'next/link';
import { WifiOff } from 'lucide-react';
import { useLocale } from '@/frontend/i18n/locale-context';
import { uiMessages } from '@/shared/ui-messages';

export default function OfflinePage() {
  const { locale } = useLocale();
  const ui = uiMessages[locale].offline;
  return (
    <main className="grid min-h-dvh place-items-center bg-[#eef3ee] px-5 text-[#202725]">
      <section className="w-full max-w-[380px] rounded-[28px] bg-white p-7 text-center shadow-[0_18px_60px_rgba(19,55,47,0.12)]">
        <WifiOff className="mx-auto text-[#2f7567]" size={42} />
        <h1 className="mt-5 text-balance text-2xl font-black">{ui.title}</h1>
        <p className="mt-3 text-pretty text-sm leading-6 text-[#65706c]">{ui.description}</p>
        <Link href="/" className="mt-6 flex min-h-11 items-center justify-center rounded-xl bg-[#12372f] font-bold text-white transition-transform active:scale-[0.96]">{ui.retry}</Link>
      </section>
    </main>
  );
}

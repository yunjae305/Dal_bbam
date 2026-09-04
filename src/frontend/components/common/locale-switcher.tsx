'use client';

import { locales, type Locale, useLocale } from '@/frontend/i18n/locale-context';

const labels: Record<Locale, string> = { ko: '한', en: 'EN', zh: '中', ja: '日' };
const accessibleLabels: Record<Locale, string> = { ko: '한국어', en: 'English', zh: '中文', ja: '日本語' };

export function LocaleSwitcher() {
  const { locale, setLocale, messages } = useLocale();
  return (
    <div className="flex items-center rounded-full bg-white/10 p-0.5" role="group" aria-label={messages.common.languageSelect}>
      {locales.map(item => (
        <button key={item} type="button" aria-label={accessibleLabels[item]} lang={item} aria-pressed={locale === item} onClick={() => setLocale(item)} className={`min-w-7 rounded-full px-1.5 py-1 text-[9px] font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${locale === item ? 'bg-white text-[#25211d]' : 'text-white/65 hover:text-white'}`}>
          {labels[item]}
        </button>
      ))}
    </div>
  );
}

'use client';

import { locales, type Locale, useLocale } from '@/frontend/i18n/locale-context';

const labels: Record<Locale, string> = { ko: '한', en: 'EN', zh: '中', ja: '日' };
const accessibleLabels: Record<Locale, string> = { ko: '한국어', en: '영어', zh: '중국어 간체', ja: '일본어' };

export function LocaleSwitcher() {
  const { locale, setLocale } = useLocale();
  return (
    <div className="flex items-center rounded-full bg-white/10 p-0.5" role="group" aria-label="언어 선택">
      {locales.map(item => (
        <button key={item} type="button" aria-label={`${accessibleLabels[item]}로 변경`} aria-pressed={locale === item} onClick={() => setLocale(item)} className={`min-w-7 rounded-full px-1.5 py-1 text-[9px] font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${locale === item ? 'bg-white text-[#25211d]' : 'text-white/65 hover:text-white'}`}>
          {labels[item]}
        </button>
      ))}
    </div>
  );
}

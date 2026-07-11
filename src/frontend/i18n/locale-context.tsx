'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export const locales = ['ko', 'en', 'zh', 'ja'] as const;
export type Locale = (typeof locales)[number];
const STORAGE_KEY = 'dal-bbam-locale';

const messages = {
  ko: { home: '홈', course: '코스', map: '지도', schedule: '일정', my: '마이' },
  en: { home: 'Home', course: 'Courses', map: 'Map', schedule: 'Schedule', my: 'My' },
  zh: { home: '首页', course: '路线', map: '地图', schedule: '行程', my: '我的' },
  ja: { home: 'ホーム', course: 'コース', map: '地図', schedule: '日程', my: 'マイ' }
} satisfies Record<Locale, Record<string, string>>;

type LocaleContextValue = { locale: Locale; setLocale: (locale: Locale) => void; messages: (typeof messages)[Locale] };
const LocaleContext = createContext<LocaleContextValue | null>(null);

function isLocale(value: string | null): value is Locale {
  return value !== null && locales.includes(value as Locale);
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>('ko');
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    const savedLocale = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(savedLocale)) setLocale(savedLocale);
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    document.documentElement.lang = locale;
    window.localStorage.setItem(STORAGE_KEY, locale);
  }, [locale, storageReady]);

  const value = useMemo(() => ({ locale, setLocale, messages: messages[locale] }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used within LocaleProvider.');
  return context;
}

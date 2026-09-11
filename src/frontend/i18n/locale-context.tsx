'use client';

import { useRouter } from 'next/navigation';
import { createContext, startTransition, useContext, useEffect, useMemo, useState } from 'react';
import { isLang, localeCookieMaxAge, localeCookieName, messages } from '@/shared/i18n';
import { languages, type Lang } from '@/shared/types';

export const locales = languages;
export type Locale = Lang;
const STORAGE_KEY = 'dal-bbam-locale';

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  messages: (typeof messages)[Locale];
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale = 'ko'
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    let savedLocale: string | null = null;
    try { savedLocale = window.localStorage.getItem(STORAGE_KEY); } catch { /* Cookie locale remains usable. */ }
    if (isLang(savedLocale) && savedLocale !== initialLocale) {
      setLocaleState(savedLocale);
      document.cookie = `${localeCookieName}=${savedLocale}; path=/; max-age=${localeCookieMaxAge}; samesite=lax`;
      startTransition(() => router.refresh());
    }
  }, [initialLocale, router]);

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  function setLocale(nextLocale: Locale) {
    setLocaleState(nextLocale);
    document.documentElement.lang = nextLocale;
    try { window.localStorage.setItem(STORAGE_KEY, nextLocale); } catch { /* Keep the in-memory and cookie locale. */ }
    document.cookie = `${localeCookieName}=${nextLocale}; path=/; max-age=${localeCookieMaxAge}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  const value = useMemo(
    () => ({ locale, setLocale, messages: messages[locale] }),
    [locale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used within LocaleProvider.');
  return context;
}

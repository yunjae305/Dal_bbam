import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { ServiceWorkerRegister } from '@/frontend/components/service-worker-register';
import { LocaleProvider } from '@/frontend/i18n/locale-context';
import { isLang, localeCookieName } from '@/shared/i18n';

export const metadata: Metadata = {
  title: 'AI와 함께하는 경주 역사 여행',
  description: '관광 데이터 기반 경주 여행 PWA MVP',
  applicationName: 'AI 경주',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg'
  },
  appleWebApp: {
    capable: true,
    title: 'AI 경주',
    statusBarStyle: 'default'
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#12372f'
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const savedLocale = cookieStore.get(localeCookieName)?.value;
  const locale = isLang(savedLocale) ? savedLocale : 'ko';

  return (
    <html lang={locale}>
      <body>
        <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

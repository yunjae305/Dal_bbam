import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { ServiceWorkerRegister } from '@/frontend/components/service-worker-register';
import { LocaleProvider } from '@/frontend/i18n/locale-context';
import { isLang, localeCookieName } from '@/shared/i18n';
import { PwaInstallProvider } from '@/frontend/components/pwa-install';

export const metadata: Metadata = {
  title: '달밤 · 경주 여행',
  description: '경주 관광지 탐색, 이동수단별 길찾기와 나만의 여행 일정',
  applicationName: '달밤',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: '/apple-touch-icon.png'
  },
  appleWebApp: {
    capable: true,
    title: '달밤',
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
        <LocaleProvider initialLocale={locale}>
          <PwaInstallProvider>{children}</PwaInstallProvider>
          <ServiceWorkerRegister />
        </LocaleProvider>
      </body>
    </html>
  );
}

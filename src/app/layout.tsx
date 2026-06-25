import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorkerRegister } from '@/frontend/components/service-worker-register';

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

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: '달밤 · 경주 여행',
    short_name: '달밤',
    lang: 'ko',
    description: '경주 관광지 탐색, 이동수단별 길찾기와 나만의 여행 일정',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    categories: ['travel', 'navigation'],
    shortcuts: [
      { name: '경주 지도', url: '/map', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: '여행 일정', url: '/schedule', icons: [{ src: '/icon-192.png', sizes: '192x192' }] }
    ],
    background_color: '#eef3ee',
    theme_color: '#12372f',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ]
  };
}

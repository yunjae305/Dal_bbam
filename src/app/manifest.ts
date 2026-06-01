import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AI와 함께하는 경주 역사 여행',
    short_name: 'AI 경주',
    description: '쇼츠형 관광 콘텐츠와 다국어 코스 추천을 제공하는 경주 여행 PWA',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#eef3ee',
    theme_color: '#12372f',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any'
      }
    ]
  };
}

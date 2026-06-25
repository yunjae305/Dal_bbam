import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AI와 함께하는 경주 역사 여행',
    short_name: 'AI 경주',
    description: '일정과 관광 콘텐츠를 바탕으로 코스를 추천하는 경주 여행 PWA',
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

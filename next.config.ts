import type { NextConfig } from 'next';

const isDevelopment = process.env.NODE_ENV !== 'production';
const kakaoMapDevelopmentScripts = isDevelopment ? ' http://t1.daumcdn.net' : '';
const kakaoMapDevelopmentImages = isDevelopment
  ? ' http://t1.daumcdn.net http://mts.daumcdn.net'
  : '';
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''} https://dapi.kakao.com https://t1.daumcdn.net https://*.daumcdn.net${kakaoMapDevelopmentScripts} https://www.youtube.com https://www.youtube-nocookie.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src 'self' data: blob: https: http://tong.visitkorea.or.kr http://i1.daumcdn.net${kakaoMapDevelopmentImages}`,
  "media-src 'self' blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://dapi.kakao.com https://apis-navi.kakaomobility.com https://apis.data.go.kr https://www.googleapis.com",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://kauth.kakao.com https://accounts.google.com",
  "frame-ancestors 'none'",
  isDevelopment ? '' : "upgrade-insecure-requests"
].filter(Boolean).join('; ');

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ['127.0.0.1'],
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(self), microphone=()' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }
      ]
    }];
  }
};

export default nextConfig;

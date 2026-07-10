# AI 경주 히스토리 트래블

2026 관광데이터 활용 공모전 제안서를 바탕으로 만든 PWA 기반 Next.js MVP입니다. 모바일에서도 바로 탐색, 추천, 쇼츠 해설을 사용할 수 있도록 프론트엔드와 백엔드 역할을 분리했습니다.

## MVP Top3

- 관광 데이터 탐색: 카테고리, 검색어, 다국어 기준으로 경주 관광 데이터를 탐색합니다.
- AI 맞춤 코스 추천: 관심사를 선택하면 Route Handler가 적합한 코스를 추천합니다.
- 1분 쇼츠형 다국어 해설: 문화재 동선을 짧은 콘텐츠 카드로 먼저 이해합니다.

## Stack

- TypeScript
- Next.js App Router
- React
- Tailwind CSS
- Supabase ready
- Next.js Route Handler
- PWA Manifest + Service Worker

## Structure

```text
src/app/
  api/                 Next.js Route Handler adapter
  layout.tsx
  manifest.ts
  page.tsx
src/backend/
  data.ts              seed data query functions
  recommend.ts         course recommendation logic
  supabase/            server Supabase helpers
src/frontend/
  components/          React client UI
  supabase/            browser Supabase helper
src/shared/
  types.ts             shared frontend/backend types
public/
  icon.svg
  sw.js
```

## Run

```bash
npm install
npm run dev
```

개발 서버는 보통 `http://localhost:3000`에서 실행됩니다.

## Build

```bash
npm run build
```

## Backend setup

`.env.example`을 `.env.local`로 복사한 뒤 필요한 서버 환경 변수를 설정합니다. `TOUR_API_KEY`, `SUPABASE_SECRET_KEY`, `KAKAO_CLIENT_SECRET`, `JWT_SECRET`, `DEMO_PASSWORD`는 `NEXT_PUBLIC_` 접두사를 붙이지 않으며 브라우저 번들에 포함하지 않습니다.

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
TOUR_API_KEY=
KAKAO_CLIENT_ID=
KAKAO_CLIENT_SECRET=
KAKAO_REDIRECT_URI=
JWT_SECRET=
```

운영 환경의 `JWT_SECRET`은 32자 이상이어야 합니다. Supabase를 사용한다면 JWT/카카오 사용자 스탬프 저장을 위해 `supabase/migrations/20260710000000_backend_auth_stamps.sql`도 적용해야 합니다.

## API

- `GET /api/health`
- `GET /api/app?lang=ko`
- `GET /api/places?lang=ko&category=all&q=동궁`
- `GET /api/courses`
- `POST /api/courses/recommend`
- `GET /api/shorts`
- `GET /api/supabase/status`
- `GET /api/tour/places?pageNo=1&numOfRows=20&contentTypeId=12`
- `GET /api/tour/search?keyword=불국사`
- `GET /api/tour/nearby?mapX=129.332&mapY=35.7901&radius=2000`
- `GET /api/tour/festivals?eventStartDate=20260710`
- `GET /api/tour/places/:contentId`
- `GET /api/tour/places/:contentId/images`
- `GET /api/auth/kakao`
- `GET /api/stamps`
- `POST /api/stamps/verify`

`POST /api/stamps/verify` 요청 예시:

```json
{
  "placeId": "125780",
  "lat": 35.7901,
  "lng": 129.332,
  "accuracyMeters": 20
}
```

TourAPI 응답은 서버 메모리와 Next.js 데이터 캐시에 저장되고 CDN 캐시 헤더를 함께 반환합니다. 동일 키의 동시 요청은 하나로 합치며, 페이지 크기·좌표·반경·날짜·콘텐츠 유형을 서버에서 검증합니다.

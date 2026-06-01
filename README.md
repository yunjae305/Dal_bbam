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

## Supabase

DB는 아직 확정 전이므로 현재는 seed 데이터를 사용합니다. Supabase 연결이 필요하면 `.env.example` 기준으로 값을 채우면 됩니다.

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

## API

- `GET /api/health`
- `GET /api/app?lang=ko`
- `GET /api/places?lang=ko&category=all&q=동궁`
- `GET /api/courses`
- `POST /api/courses/recommend`
- `GET /api/shorts`
- `GET /api/supabase/status`

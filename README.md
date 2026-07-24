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

`.env.example`을 `.env.local`로 복사한 뒤 필요한 서버 환경 변수를 설정합니다. `TOUR_API_KEY`, `SUPABASE_SECRET_KEY`, `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`, `JWT_SECRET`, `DEMO_PASSWORD`는 `NEXT_PUBLIC_` 접두사를 붙이지 않으며 브라우저 번들에 포함하지 않습니다.

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
TOUR_API_KEY=
KAKAO_REST_API_KEY=
NEXT_PUBLIC_KAKAO_MAP_JS_KEY=
KAKAO_CLIENT_SECRET=
KAKAO_REDIRECT_URI=http://localhost:3000/api/auth/kakao/callback
FRONTEND_URL=http://localhost:3000
JWT_SECRET=
OPENAI_API_KEY=
OPENAI_TEXT_MODEL=gpt-5.6-terra
OPENAI_TTS_MODEL=tts-1
OPENAI_MODERATION_MODEL=omni-moderation-latest
```

운영 환경의 `JWT_SECRET`은 32자 이상이어야 합니다. Supabase를 사용한다면 아래 마이그레이션을 순서대로 적용합니다.

Supabase Dashboard의 SQL Editor에서 마이그레이션 SQL을 실행하거나, CLI 프로젝트를 연결한 뒤 적용합니다.

```bash
npx supabase init
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

- `20260709000000_tourism_core_schema.sql`: 관광·AI·코스·일정·장바구니·스탬프·배지·커뮤니티 기본 스키마와 private/public Storage bucket
- `20260710000000_backend_auth_stamps.sql`: 자체 JWT 사용자 스탬프 저장
- `20260717000000_social_users.sql`: 카카오 사용자와 `(provider, provider_user_id)` 고유 제약
- `20260724000000_sprint2_hardening.sql`: 원시 GPS 좌표 제거와 원자적 API 사용량 제한

### 카카오 로그인 설정

1. 카카오디벨로퍼스에서 카카오 로그인을 활성화합니다.
2. REST API 키를 `KAKAO_REST_API_KEY`에 입력해 로그인·서버 길찾기에 사용합니다.
3. JavaScript 키를 `NEXT_PUBLIC_KAKAO_MAP_JS_KEY`에 입력하고 Web 플랫폼 도메인에 로컬/배포 주소를 등록합니다. 이 키만 브라우저 번들에 포함됩니다.
4. REST API 키의 클라이언트 시크릿이 활성화되어 있으면 값을 `KAKAO_CLIENT_SECRET`에 입력합니다.
5. REST API 키의 Redirect URI에 로컬 주소 `http://localhost:3000/api/auth/kakao/callback`을 정확히 등록합니다.
6. 현재 운영 배포에는 `https://gyeongju-test.vercel.app/api/auth/kakao/callback`을 별도로 등록하고, 배포 환경의 `KAKAO_REDIRECT_URI`에 같은 값을 설정합니다. `FRONTEND_URL`은 `https://gyeongju-test.vercel.app`으로 설정합니다.
7. 카카오 로그인 동의항목에서 필요한 프로필/이메일 동의를 설정합니다. 이메일은 제공되지 않아도 가입할 수 있습니다.

현재 프론트엔드와 API는 하나의 Next.js 앱에서 같은 오리진으로 서비스됩니다. 브라우저 요청은 `credentials: include`, 인증 쿠키는 `HttpOnly`, `SameSite=Lax`, 운영 환경에서 `Secure`로 설정되므로 별도 CORS 허용은 필요하지 않습니다. 프론트엔드와 API를 서로 다른 사이트로 분리할 경우에는 공유 가능한 쿠키 도메인과 명시적인 CORS 허용 오리진을 별도로 설계해야 합니다.

## API

- `GET /api/health`
- `GET /api/app?lang=ko`
- `GET /api/places?lang=ko&category=all&q=동궁`
- `GET /api/places/:contentId?lang=ko`
- `GET /api/home?lang=ko`
- `GET /api/maps/directions?originLat=...&originLng=...&destinationLat=...&destinationLng=...&mode=car`
- `GET /api/ai/narrations/:contentId?lang=ko`
- `GET /api/ai/narrations/:contentId/audio?lang=ko`
- `GET /api/courses`
- `POST /api/courses/recommend`
- `GET /api/schedules`
- `PATCH /api/schedules/:id`
- `GET|POST|DELETE /api/cart`
- `GET /api/shorts`
- `GET|POST /api/community`
- `POST /api/community/uploads/sign`
- `POST /api/community/uploads/complete`
- `POST /api/community/story`
- `GET /api/supabase/status`
- `GET /api/tour/places?pageNo=1&numOfRows=20&contentTypeId=12`
- `GET /api/tour/search?keyword=불국사`
- `GET /api/tour/nearby?mapX=129.332&mapY=35.7901&radius=2000`
- `GET /api/tour/festivals?eventStartDate=20260710`
- `GET /api/tour/places/:contentId`
- `GET /api/tour/places/:contentId/images`
- `GET /api/auth/kakao/login`
- `GET /api/auth/kakao/callback`
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

## 데이터 준비와 출시 순서

```bash
# 1. 비파괴 migration 적용
npx supabase db push

# 2. TourAPI 장소를 DB에 동기화
npm run sync:tour

# 3. 주요 50곳×4개 언어 해설·음성을 사전 생성
npm run pregenerate:ai

# 4. 자동 검사
npm run typecheck
npm run test
npm run build
npm run test:e2e

# 배포 후보 서버에서 공개 조회 100 동시 요청 검증
LOAD_TEST_URL=https://your-preview.example npm run test:load
```

런타임 관광 데이터는 Supabase → TourAPI → 내장 샘플 순으로 대체됩니다. OpenAI 또는 카카오모빌리티 호출이 시간 내 완료되지 않으면 각각 원문 기반 해설·점수 기반 코스와 직선거리 예상치로 대체됩니다. 개인 일정·장바구니·스탬프·AI 응답은 서비스 워커에 저장하지 않습니다.

## 직접 접근 화면

- `/map`
- `/places/:contentId`
- `/shorts`
- `/courses`
- `/schedule`
- `/cart`
- `/stamps`
- `/community`

코스와 일정은 저장 후 32자리 임의 공유 토큰으로 읽기 전용 링크를 만들며, 사용자 `actor_key`는 공개 응답에 포함하지 않습니다.

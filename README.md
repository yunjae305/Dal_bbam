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
KAKAO_MAP_JS_ALLOWED_ORIGINS=http://localhost:3000
KAKAO_MAP_REQUEST_TIMEOUT_MS=4500
KAKAO_CLIENT_SECRET=
KAKAO_REDIRECT_URI=http://localhost:3000/api/auth/kakao/callback
FRONTEND_URL=http://localhost:3000
JWT_SECRET=
OPENAI_API_KEY=
OPENAI_TEXT_MODEL=gpt-5.6-terra
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_TTS_MODEL=tts-1
OPENAI_MODERATION_MODEL=omni-moderation-latest
DEMO_MODE_ENABLED=false
ADMIN_EMAILS=
ADMIN_API_SECRET=
CRON_SECRET=
PUBLIC_OPERATOR_NAME=
PRIVACY_CONTACT_EMAIL=
LOCATION_TERMS_EFFECTIVE_DATE=
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
- `20260828000100_shorts_video.sql`: 쇼츠 YouTube/MP4 원본·게시 상태·정렬 필드
- `20260828000200_stamp_hardening_ai.sql`: 스탬프 체크포인트·GPT 이미지 보상·중복 발급 방지
- `20260828000300_release_hardening.sql`: 영속 세션·안정적인 사용자 식별자·커뮤니티 신고/차단/댓글·계정 삭제·정리 작업

### 카카오 로그인·지도 설정

1. 카카오디벨로퍼스에서 카카오 로그인을 활성화합니다.
2. 앱 관리의 **카카오맵 > 사용 설정**을 ON으로 설정하고, REST API 키를 `KAKAO_REST_API_KEY`에 입력해 로그인·장소 검색·도보/대중교통/자전거 경로·자동차 길찾기에 사용합니다.
3. JavaScript 키를 `NEXT_PUBLIC_KAKAO_MAP_JS_KEY`에 입력하고 JavaScript SDK 도메인에 로컬/배포 오리진을 프로토콜과 포트까지 정확히 등록합니다. 이 키만 브라우저 번들에 포함됩니다.
4. 등록한 오리진을 `KAKAO_MAP_JS_ALLOWED_ORIGINS`에도 쉼표로 구분해 입력합니다. `/api/health`가 `FRONTEND_URL` 오리진의 등록 선언 누락을 탐지할 때 사용하며 실제 카카오 콘솔 등록을 대신하지 않습니다.
5. 로컬 E2E를 기본 `http://127.0.0.1:3200`에서 실행한다면 해당 오리진도 카카오 콘솔과 `KAKAO_MAP_JS_ALLOWED_ORIGINS` 양쪽에 추가합니다.
6. REST API 키의 클라이언트 시크릿이 활성화되어 있으면 값을 `KAKAO_CLIENT_SECRET`에 입력합니다.
7. REST API 키의 Redirect URI에 로컬 주소 `http://localhost:3000/api/auth/kakao/callback`을 정확히 등록합니다.
8. 운영 배포에서는 `https://your-domain.example/api/auth/kakao/callback`을 별도로 등록하고 `KAKAO_REDIRECT_URI`, `FRONTEND_URL`, `KAKAO_MAP_JS_ALLOWED_ORIGINS`를 같은 운영 오리진 기준으로 설정합니다.
9. 카카오 로그인 동의항목에서 필요한 프로필/이메일 동의를 설정합니다. 이메일은 제공되지 않아도 가입할 수 있습니다.

2026년 7월 21일 이후 카카오맵 API는 개발자 계정에서 첫 번째로 활성화한 앱에만 무료 쿼터가 적용됩니다. 출시 전 카카오디벨로퍼스의 쿼터 화면에서 무료 적용 앱, 비즈월렛 연결, 일간 사용량 알림을 확인합니다. 지도 서버 API는 경주 권역 제한, 요청 제한, 4.5초 기본 타임아웃과 5분 캐시를 적용하지만 서버리스 인스턴스 전체를 아우르는 한도는 배포 플랫폼의 WAF/Rate Limit도 함께 설정해야 합니다.

현재 프론트엔드와 API는 하나의 Next.js 앱에서 같은 오리진으로 서비스됩니다. 브라우저 요청은 `credentials: include`, 인증 쿠키는 `HttpOnly`, `SameSite=Lax`, 운영 환경에서 `Secure`로 설정되므로 별도 CORS 허용은 필요하지 않습니다. 프론트엔드와 API를 서로 다른 사이트로 분리할 경우에는 공유 가능한 쿠키 도메인과 명시적인 CORS 허용 오리진을 별도로 설계해야 합니다.

## OpenAI 없이 운영하기

OpenAI 키를 쓰지 않으려면 `.env.local`에서 `OPENAI_API_KEY`를 비우고 `FEATURE_AI=false`로 둡니다. 이 상태에서도 아래처럼 동작합니다.

- AI 해설: 관광지 원문을 바탕으로 한 기본 해설(`isAiGenerated: false`)을 반환하고, 음성(TTS)은 503 `TTS_UNAVAILABLE`로 응답합니다.
- AI 코스 추천: 규칙 기반 플래너가 `기본 플랜`을 만들어 저장·공유까지 그대로 됩니다.
- 커뮤니티 글쓰기·수정: OpenAI 안전 검사 대신 개인정보(이메일·전화번호)와 금칙어 기본 검사만 적용됩니다. 사진은 형식·용량 검사 후 그대로 공개됩니다.
- 사진 AI 스토리 초안, 스탬프 AI 아트 생성은 사용할 수 없습니다(503 `FEATURE_DISABLED`).

## 크롬 창 순회 테스트

```bash
npm run dev            # 다른 터미널
npm run test:browser   # 크롬 창을 띄워 로그인→홈→지도 길찾기→장소→코스→일정→장바구니→스탬프→커뮤니티→쇼츠→설정 순회
```

데모 로그인(`DEMO_MODE_ENABLED=true`, `DEMO_EMAIL`, `DEMO_PASSWORD`)이 필요하며, 결과 스크린샷과 `report.json`이 `browser-tour/`에 저장됩니다. `HEADLESS=1`을 주면 창 없이 실행됩니다.

## 길찾기 (출발지·도착지 비교)

지도 화면의 하단 카드에서 **출발**·**도착** 칩을 눌러 각각을 지정합니다. 지정 방법은 세 가지입니다.

- 지도를 탭하면 그 지점이 선택됩니다.
- 목록이나 마커에서 장소를 고르면 그 장소가 선택됩니다.
- `현재 위치 사용` 버튼으로 GPS 위치를 넣습니다. 출발지가 비어 있으면 현재 위치 버튼(조준 아이콘)을 누른 순간 자동으로 출발지가 됩니다.

두 지점이 모두 정해지면 `GET /api/maps/directions?mode=all`로 도보·대중교통·자전거·자동차 경로를 한 번에 조회해 4개 버튼에 소요 시간을 표시하고, 가장 빠른 경로를 자동 선택해 폴리라인을 그립니다. 대중교통은 환승 횟수와 요금, 자동차는 통행료(있을 때)를 함께 보여 주며 `경로 안내`를 펼치면 구간별 안내를 볼 수 있습니다. `≈` 표시는 카카오 경로 공급자 응답이 없어 직선거리 기준으로 추정한 값입니다. 서비스 권역(경주 인근)을 벗어난 지점은 400으로 거부됩니다.

## 스탬프 GPS 검증

`현장 확인`을 누르면 `watchPosition`으로 최대 15초 동안 GPS 샘플을 모아 정확도가 `STAMP_MAX_ACCURACY_M`(기본 100m) 이내인 첫 샘플을 서버로 보냅니다. 15초 안에 기준을 만족하지 못하면 가장 정확한 샘플을 보내고, 서버가 `LOW_ACCURACY`로 거절하면 카드에 그대로 표시됩니다. 마지막 GPS 정확도와 각 스탬프까지의 거리·허용 반경이 카드 아래에 표시되므로 현장에서 반경 안팎을 바로 확인할 수 있습니다. 스탬프 저장에는 Supabase(`claim_stamp` RPC)와 로그인 세션이 필요합니다.

## Android APK (TWA) 빌드와 실기기 테스트

PWA를 그대로 감싸는 Trusted Web Activity APK를 만들어 실기기에 설치할 수 있습니다. TWA는 **HTTPS 오리진**만 열 수 있고 브라우저 정책상 `http://` 오리진에서는 위치정보가 차단되므로, GPS 스탬프 테스트는 배포된 HTTPS 주소(Vercel 등)나 `cloudflared tunnel --url http://localhost:3000` 같은 HTTPS 터널 주소로 진행합니다.

```bash
# 1) 배포 주소를 넣어 APK 생성 (첫 실행 시 JDK 17·Android SDK·Gradle을 ~/.dal-bbam-android 아래에 내려받습니다)
npm run android:apk -- --host https://your-deployment.example

# 2) USB 디버깅을 켠 기기를 연결한 상태라면 바로 설치
npm run android:apk -- --host https://your-deployment.example --install
```

- 결과물: `android/dist/dal-bbam-<host>-<timestamp>.apk` (Git 추적 제외). 서명은 `android/dal-bbam-debug.keystore`(자동 생성, 비밀번호 `dalbbam-debug`, `BUBBLEWRAP_KEYSTORE_PASSWORD`/`BUBBLEWRAP_KEY_PASSWORD`로 변경)로 하며 테스트 전용입니다.
- 스크립트는 서명 인증서 지문으로 `public/.well-known/assetlinks.json`을 갱신합니다. 이 파일을 함께 배포해야 Chrome이 주소창을 숨긴 전체 화면으로 열립니다. 배포 전이라도 앱은 동작하며 상단에 주소창이 보일 뿐입니다.
- `android/twa-manifest.template.json`이 앱 이름·색상·`locationDelegation`(앱 권한으로 위치 요청) 설정의 원본이며, `android/twa/`는 매번 재생성됩니다.
- 옵션: `--package kr.dalbbam.gyeongju`, `--name "AI 경주"`, `--version 1.0.1`, `--skip-tools`(이미 구성된 `~/.bubblewrap/config.json` 사용).
- 반복 테스트 절차: 코드 수정 → 배포(또는 터널 재연결) → 같은 명령으로 APK 재생성 → `--install` → 기기에서 스탬프 화면의 `현장 확인`을 눌러 GPS 정확도·거리 문구와 서버 응답을 확인합니다. 웹 자산은 앱이 아니라 서버에서 오므로 프런트 변경만 있을 때는 APK를 다시 만들 필요 없이 앱을 다시 열면 됩니다.

## API

- `GET /api/health`
- `GET /api/app?lang=ko`
- `GET /api/places?lang=ko&category=all&q=동궁`
- `GET /api/places/:contentId?lang=ko`
- `GET /api/home?lang=ko`
- `GET /api/maps/directions?originLat=...&originLng=...&destinationLat=...&destinationLng=...&mode=car|walking|public|bicycle|all&originName=...&destinationName=...` (`mode=all`은 4개 모드 결과를 `results[]`로 한 번에 반환)
- `GET /api/maps/places?query=불국사&south=...&west=...&north=...&east=...`
- `GET /api/maps/places?category=AT4`
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

런타임 관광 데이터는 Supabase → TourAPI → 내장 샘플 순으로 대체됩니다. 지도 화면은 여기에 카카오 장소 검색 결과를 합치며, 실제 도보·대중교통·자전거 경로는 Kakao Map REST API, 자동차 경로는 Kakao Mobility를 사용합니다. 공급자 호출이 시간 내 완료되지 않으면 명시적인 직선거리 예상치로 대체됩니다. 개인 일정·장바구니·스탬프·AI 응답은 서비스 워커에 저장하지 않습니다.

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

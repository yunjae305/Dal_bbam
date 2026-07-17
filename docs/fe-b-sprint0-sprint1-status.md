# FE-B Sprint 0·Sprint 1 구현 상태

작성 기준: `feat/fe-b-ui-merge`, FE-B v4.2 독립 작업본 비교

## 1. FE-B 공식 역할

- 공통 레이아웃, 헤더, 하단 네비게이션
- 한·영·중·일 언어 전환 UI
- AI SNS 쇼츠, 로그인·회원가입, 스탬프 투어
- AI 추천 코스, 여행 일정, 여행 장바구니, 커뮤니티

이번 정리 범위는 Sprint 0·1 공통 기반이다. Sprint 2 이후 화면은 기존 구현을 보존하고 대규모 이식하지 않았다.

## 2. Sprint 0 완료 기준과 결과

| 기준 | 결과 | 비고 |
|---|---|---|
| Next.js 프로젝트 실행 기반 | 완료 | Next.js 16, React 19, Tailwind CSS 4 유지 |
| 공통 레이아웃 | 완료 | `src/app/layout.tsx`와 모바일 앱 컨테이너 유지 |
| 모바일 우선 컨테이너 | 완료 | 최대 430px, safe area 하단 여백 적용 |
| 공통 UI 구조 | 완료 | `src/frontend/components/common` 사용 |
| 재사용 헤더·네비게이션 | 완료 | HeaderBar 및 BottomNavigation |
| 색상·간격 중복 정리 | 부분 완료 | 기존 v4.2 색상 유지, 디자인 토큰 통합은 디자인 QA에서 진행 |
| 다국어 확장 구조 | 완료 | Locale 타입, Context, localStorage, 문서 lang 동기화 |
| ZIP·임시 폴더 미포함 | 완료 | ZIP은 저장소 외부 임시 폴더에서만 비교 |
| 기존 src 구조 유지 | 완료 | backend/shared/Supabase/Auth 변경 없음 |
| 브랜치·변경 관리 | 완료 | `feat/fe-b-ui-merge`에서만 수정 |

## 3. Sprint 1 완료 기준과 결과

| 기준 | 결과 | 비고 |
|---|---|---|
| 공통 헤더 | 완료 | title/subtitle/left/right 지원, 모바일 말줄임 보완 |
| 공통 하단 네비게이션 | 완료 | 선택 상태, 실제 탭 전환, aria-current, safe area 적용 |
| 4개 언어 스위처 | 완료 | ko/en/zh/ja, 선택 표시, 저장·복원, hydration 안전 처리 |
| 공통 Skeleton | 완료 | SkeletonBox 및 AppLoadingSkeleton |
| 라우트 로딩 | 완료 | `src/app/loading.tsx` |
| 오류 및 재시도 | 완료 | `src/app/error.tsx`, ErrorState, reset 연결 |
| 404 | 완료 | `src/app/not-found.tsx` |
| 빈 결과 | 완료 | EmptyState 공통화, 검색 결과 목록에 적용 |
| 포커스 접근성 | 완료 | 전역 focus-visible 및 버튼별 aria 상태 보완 |

## 4. 현재 저장소 구현 상태

현재 저장소의 서버 데이터 조회, Supabase 인증, Route Handler, 세션 처리를 정본으로 유지했다. 홈·지도·로그인과 Sprint 2 이후 화면은 기존 `TravelMvpApp` 흐름 안에서 동작한다. 언어 전환은 현재 하단 메뉴 문구부터 적용하며 번역 사전 확장이 가능한 인터페이스를 제공한다.

> Four-locale state and persistence foundation were added. Full application copy translation remains future work.

## 5. FE-B v4.2에서 선별 이식한 부분

- Locale 타입과 클라이언트 저장 방식의 아이디어
- 언어 선택 버튼의 선택 상태와 문서 언어 동기화
- Skeleton, Error, Empty, 404 공통 상태 구조
- 재사용 가능한 하단 네비게이션 구조
- focus-visible 및 reduced-motion 접근성 원칙

Zustand, React Query, v4.2 데이터 계층과 Provider는 가져오지 않았다. 위 기능은 현재 의존성만으로 다시 작성했다.

## 6. 현재 저장소에서 유지한 부분

- Next.js 16 및 `src/app` 구조
- `src/backend`, `src/shared`, TourAPI, Supabase 전체
- 로그인·회원가입 API, 카카오 OAuth, 세션 쿠키
- `getTourMvpData()` 데이터 조회 흐름
- 기존 Tailwind CSS 4 스타일 체계
- 기존 로그인·홈·스탬프·코스·일정·장바구니 화면

## 7. 아직 미완료인 부분

- 모든 화면 문구의 4개 언어 번역
- AI SNS 쇼츠와 커뮤니티 화면
- 일정 Drag & Drop 및 장바구니 세부 클릭 상태
- 실제 AI, GPS, 지도, 저장 API 연동
- 피그마 기준 픽셀 단위 디자인 QA
- 화면별 이미지·아이콘 원본 분류

## 8. 피그마 자료 도착 후 확인 항목

- 390~430px 화면의 간격, 서체, 색상, 배경
- 헤더와 하단 네비게이션의 높이 및 safe area
- 로그인·홈·카테고리 화면 이미지
- 공용 아이콘과 화면 전용 에셋 분류
- 버튼의 눌림·선택·비활성 상태

원본이 없는 이미지나 아이콘은 이번 작업에서 생성하지 않았다.

## 9. Sprint 2 이후 FE-B 작업 순서

1. Sprint 2: 로그인 디자인 QA, AI 쇼츠, TTS 플레이어, 스탬프 GPS 버튼 상태
2. Sprint 3: AI 코스 입력·로딩·결과, 일정 Drag & Drop, 장바구니 선택·전송
3. Sprint 4: 커뮤니티 목록·작성·상세, 리뷰·북마크, 4개국어·모바일·접근성 QA

현재 Git에는 로그인·스탬프·추천 코스·일정·장바구니가 부분 병합되어 있다. AI SNS와 커뮤니티는 아직 이식이 필요하다.

## 10. 백엔드/API 의존 기능

- AI 해설·추천 결과: AI API 필요
- 실제 장소 저장·일정 저장·장바구니: BE API 및 사용자 세션 필요
- GPS 스탬프 인증: 위치 권한과 검증 API 필요
- 커뮤니티 작성·리뷰·북마크: BE CRUD API 필요
- 지도·동선: 지도 SDK 및 좌표 API 필요

## 11. 수정한 파일

- `src/app/layout.tsx`, `globals.css`, `loading.tsx`, `error.tsx`, `not-found.tsx`
- `src/frontend/i18n/locale-context.tsx`
- `src/frontend/components/common/{ui,bottom-navigation,feedback,locale-switcher}.tsx`
- `src/frontend/components/travel-mvp-app.tsx`
- `src/frontend/components/travel/itinerary-screen.tsx`, `travel-cart-screen.tsx`

빈 대문자 중복 파일 `AiCourseScreen.tsx`, `StampTourScreen.tsx`, `TravelCartScreen.tsx`는 삭제했다. 실제 kebab-case 구현 파일은 유지했다.

## 12. 검증 결과

- TypeScript: `tsc --noEmit --incremental false` 통과
- lint: 현재 `package.json`에 lint 스크립트가 없어 미실행
- build: `npm run build` 통과 (Next.js 16.2.6, 28개 페이지 생성)
- HTTP 확인: `/api/health` 200, `/login` 200, 비로그인 `/`은 기존 인증 정책대로 `/login` 307
- 404 제한: `not-found.tsx`는 빌드에 정상 포함됐지만 보호 경로에서는 인증 프록시가 먼저 동작하므로 실제 404 화면을 브라우저로 확인하지 못함

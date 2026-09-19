# 관광 요구사항 구현·검증 추적표

> 2026-09-19에 에뮬레이터 실화면으로 다시 확인한 결과와 이후 변경은 [실화면 검증 기록](requirements-verification-2026-09-19.md)에 있다. 쇼츠 영상 피드는 사용자 결정으로 감춘 상태다.

기준일: 2026-09-06. 정본은 [요구사항명세서(관광).docx](<../요구사항명세서(관광).docx>) v1.1이다. 아래 표는 **기능 요구사항 33개와 비기능 요구사항 14개**를 현재 코드 및 검증 근거에 연결한다. 실서비스 충족 여부는 외부 연결, 운영 데이터, 배포 환경과 성능 측정 결과를 함께 확인해야 한다.

**기술 결정.** 기존 [아키텍처 결정](sprint0-sprint2-implementation.md)에 따라 Next.js 16 App Router·React 19·Supabase/PostgreSQL·PWA 구조를 유지했다. 명세 9절의 Next.js 14·MongoDB·Mongoose는 초기 제안 기술이며 현행 시스템으로 대체한다. 인증은 서버에서 확인한 세션과 `actor_key`로 소유권을 구분한다. 클라이언트가 전달하는 `user_id`를 신뢰하지 않는다. AR/VR, 10개 이상 언어, 해외 도시 확대는 장기 로드맵이며 이번 33개 FR 범위에 포함되지 않는다.

**쇼츠 운영 결정.** 이후 사용자 설명에 따라 초기 쇼츠는 문화재가 인격화되어 소개하는 완성 영상 또는 짧은 문화재 소개 영상을 미리 등록하는 방식이다. `/admin/shorts`에서 MP4·YouTube 영상의 초안·공개 상태를 관리하고, 완성 영상 재생에 AI 생성 키를 요구하지 않는다. AI 추천·추가 해설과 영상 제작은 각각 별도 흐름이다. [영상 운영 안내](shorts-content-workflow.md)

**검증 상태 읽기.** 표의 “구현”은 실행 경로와 해당 화면/API가 존재한다는 뜻이다. 단위·컴포넌트·API 계약 테스트는 통제된 입력과 mock을 포함한다. SQL 검증은 별도 실제 PostgreSQL 엔진에서 수행했다. 사용자가 Supabase를 복구한 뒤 다시 점검하여 관광지 545건 조회를 확인했다. 다만 8월 말 이후 마이그레이션 5개의 테이블·열·함수가 누락되어 최신 기능의 실서비스 전체 흐름 검증은 아직 완료되지 않았다. OpenAI 키가 없어 실제 AI 생성·음성 품질도 미검증이다.

**최신 배포 판정: 공개 배포 준비 미완료.** 운영 설정과 DB 구조·저장소·콘텐츠를 검사하는 `release:check`도 현재 실패한다. 코드 보완, 최신 검사 결과와 외부 선행 조건은 [운영 배포 안내](production-release.md)를 따른다.

## 기능 요구사항 33개

경로 표기는 저장소 루트 기준이다. 테스트 파일과 같은 디렉터리의 구현 파일은 아래 경로에서 확인할 수 있다.

| ID | 요구사항 | 현재 구현과 이번 보완 | 검증 근거·운영 조건 |
|---|---|---|---|
| FR-HOME-001 | 관광지 카테고리 탐색 | `/`의 문화재·음식·숙박·축제·자연 등 분류 → `/map?category=`; TourAPI 콘텐츠 유형·분류 코드 매핑 | `src/shared/tour-category.test.ts`, `tests/e2e/mobile-smoke.spec.ts` |
| FR-HOME-002 | 개인화 추천 배너 | `/api/home/personalized`; 로그인 사용자의 최근 조회·찜 이력과 관심 카테고리 반영 | `src/backend/personalize.test.ts`; 실제 사용자 세션·이력 연동은 누락된 DB 스키마 적용 후 확인 |
| FR-HOME-003 | 조회수 기반 인기 랭킹 | `/api/home`; 최근 7일 조회 이벤트를 DB에서 전체 집계 후 정렬하도록 수정. 조회 기록은 `/api/places/[contentId]/events` | `src/app/api/home/route.test.ts`, SQL 검증의 1,503건 집계·기간/이벤트 유형 제외; 신규 랭킹 migration 필요 |
| FR-HOME-004 | 한·영·중·일 전환 | 공통 `LocaleSwitcher`, `LocaleProvider`, 쿠키·로컬 설정; 전환 시 전역 문서 언어 갱신 | `src/shared/i18n.test.ts`, 모바일 E2E 언어 전환 |
| FR-MAP-001 | 지도 핀·클러스터 탐색 | `/map`, `kakao-map-explorer.tsx`, Kakao MarkerClusterer, TourAPI/Supabase 좌표; `/api/maps/places` 검색 | `kakao-map-explorer.test.tsx`, `src/app/api/maps/places/route.test.ts`; Kakao 읽기 API 실연결 확인 |
| FR-MAP-002 | 사진·설명·운영시간·연락처·리뷰 | `/places/[contentId]`, `/api/places/[contentId]`; TourAPI 상세·사진, 장소별 리뷰, `/api/places/[contentId]/heritage` 국가유산 보충 정보 | `place-reviews.test.tsx`, `src/backend/heritage-api.test.ts`; TourAPI·국가유산 실연결 확인, 실사용자 리뷰는 DB 필요 |
| FR-MAP-003 | GPS 주변 탐색 | 위치 동의 후 GPS 조회, 반경 내 관광지와 현재 위치 표시; `/api/tour/nearby` | `src/frontend/geolocation.test.ts`, `map-page-screen.test.tsx`, 지도 컴포넌트 테스트; 실제 단말 권한·현장 위치 검증은 별도 |
| FR-MAP-004 | 경로·거리·시간 | `/api/maps/directions`; 도보·자동차·대중교통·자전거 조회, 구간 경로와 외부 길찾기. 코스도 `src/backend/kakao-directions.ts` 공통 서비스 사용 | `src/app/api/maps/directions/route.test.ts`, `course-route-map.test.tsx`; 경로 공급자 실패 시 직선거리 추정임을 표시 |
| FR-MAP-005 | 지도 카테고리 필터 | 카테고리·검색어·주변 탐색 결과에 필터 적용; URL 상태와 연결 | `map-page-screen.test.tsx`, `kakao-map-explorer.test.tsx`, 모바일 E2E |
| FR-SNS-001 | AI 문화재 쇼츠 피드 | 사용자 초기 운영 결정 반영: `/admin/shorts`에서 완성 MP4·YouTube 등록·수정·초안/공개 관리. `/shorts` 세로 피드·화면 내 재생·태그·추가 로딩·문화재 상세 연결. 영상 대본 선택 입력이며 완성 영상에 별도 AI 음성 생성 불필요 | `src/backend/shorts-admin.test.ts`, `src/app/api/admin/shorts/route.test.ts`, `shorts-editor.test.tsx`, `shorts-screen.test.tsx`, `short-video-player.test.tsx`; 실제 문화재 영상 등록과 원격 DB 스키마 적용 필요 |
| FR-SNS-002 | 방문자 사진 기반 스토리 | `/api/community/story`에서 본인 승인 사진 기반 AI 초안 생성·편집, 명시적 게시. `/api/community/stories`는 최근 공개 문화재 사진 게시물을 피드에 제공하고 화면이 활성화된 동안 갱신 | `community/story/route.test.ts`, `community/stories/route.test.ts`, `visitor-stories.test.tsx`; 원격 업로드·AI 생성 미검증 |
| FR-SNS-003 | 다국어 텍스트·TTS 해설 | `/api/ai/narrations/[contentId]` 및 `/audio`; 언어별 원문·해설 캐시, 실패/키 없음 시 출처에 기반한 안내, 서버 TTS와 브라우저 음성 대체 경로 | `src/backend/narration.test.ts`, `src/backend/openai.test.ts`, `ai/narrations/[contentId]/audio/route.test.ts`; 음성 서비스·단말 음성 지원에 영향받음 |
| FR-SNS-004 | 좋아요·공유·저장 | 쇼츠 반응 API, 저장 상태, Web Share·링크 공유; 저장 실패를 성공으로 표시하지 않음 | `shorts-screen.test.tsx`, `src/app/api/shorts/route.test.ts`; 영속 반응은 DB 필요 |
| FR-SNS-005 | 관심 태그 필터 | 선택 태그를 `/api/shorts` 쿼리와 후속 페이지 요청에 유지 | `shorts-screen.test.tsx`, `src/app/api/shorts/route.test.ts` |
| FR-COM-001 | 후기 작성·조회·사진 업로드 | `/community`, `/community/[id]`; 편집기, 서명 업로드→파일 검증→승인 미디어 연결, 게시·수정·삭제 | `community-post-editor.test.tsx`, `community/route.test.ts`, `community/[id]/route.test.ts`, `community/uploads/complete/route.test.ts`; 원격 Storage/DB 쓰기 미검증 |
| FR-COM-002 | 지역·카테고리별 꿀팁 | 커뮤니티 꿀팁 분류, 경주 지역과 연관 장소 카테고리 필터를 목록/API에 연결 | `community-screen.test.tsx`, `community/route.test.ts` |
| FR-COM-003 | 맛집·숙소 별점·텍스트 리뷰 | 장소 상세에서 평가 작성·조회, 별점 요약. 식당/숙박 분류는 실제 장소 카테고리와 일치해야 저장 | `place-reviews.test.tsx`, `community-post-editor.test.tsx`, `community/route.test.ts`; DB 연동 필요 |
| FR-COM-004 | 게시물 저장·북마크 | `/api/community/[id]/bookmark`; 저장 목록 화면에서 조회, 숨김·차단 게시물과 실패 처리 보완 | `community/[id]/bookmark/route.test.ts`, `community-screen.test.tsx` |
| FR-STAMP-001 | GPS 방문 인증 | `/api/stamps/verify`; 동의·좌표·정확도·거리·대상 검증 후 영속 저장, 설정된 현장 체크포인트 지원 | `src/backend/stamps.test.ts`, `src/backend/geo.test.ts`, `stamps/verify/route.test.ts`, 모바일 E2E; 실제 현장 GPS와 원격 적립 미검증 |
| FR-STAMP-002 | 컬렉션·달성률 | `/stamps`, `/api/stamps`; 도감·획득 수·진행률과 실제 대상 카탈로그 | `src/shared/stamp-themes.test.ts`, 스탬프 API/E2E; DB 실패 시 가짜 획득 상태를 생성하지 않음 |
| FR-STAMP-003 | 배지·리워드 | `/api/badges`, 스탬프 리워드; 획득 단계별 배지·여행자 칭호 제공, 기본 칭호 4개 언어화 | `src/shared/stamp-rewards.test.ts`, 스탬프 검증 테스트; 실제 제휴 할인쿠폰/교환 조건은 제공되지 않으며 운영자 제휴 확정 필요 |
| FR-STAMP-004 | 역사·미식·자연 코스 | `src/shared/stamp-themes.ts`, 테마별 카탈로그·달성률 필터; TourAPI 동기화 시 세 테마의 유효 좌표 대상 선정 | `src/shared/stamp-themes.test.ts`, `src/shared/stamp-seed.test.ts`; 대상 동기화 필요 |
| FR-CRS-001 | 맞춤 코스 추천 | `/courses`, `/api/courses/recommend`; 목적·1~7일·동행·관심사·여행 속도·이동수단·시작 시각. AI 실패 시 4개 언어 규칙 기반 코스 | `src/backend/course-planner.test.ts`, `planning-workflows.test.tsx`; 실제 LLM 추천은 키 필요 |
| FR-CRS-002 | 시간대별 동선 최적화 | 거리순 동선과 이동수단별 시간, 지도 API 거리/시간/경로, 일차·도착/종료 시각·관람시간 계산. 날짜가 달라지는 구간은 별도 여행일로 처리 | `course-timing.test.ts`, `course-planner-provider.test.ts`, `course-route-map.test.tsx`; 운영시간·예약 가능 여부까지 보장하지 않음 |
| FR-CRS-003 | 코스 저장·공유 | `/api/courses`, `/api/courses/[id]`, `/courses/share/[token]`; 순서별 이유·체류시간 보존, 중복/길이 검증, 소유권과 공유 토큰 | `src/app/api/courses/route.test.ts`, `planning-workflows.test.tsx`; 실제 저장·외부 공유 수신은 DB 필요 |
| FR-CRS-004 | 관리자 큐레이션 | `/admin/courses`, `/api/admin/courses`; 관리자만 테마·장소·순서·관람시간 등록/편집/삭제, 일반 화면 테마 탐색·공유 | `src/app/api/admin/courses/route.test.ts`, 실제 SQL 생성/수정/토큰 보존/개인 코스 보호 검증; 신규 migration·관리자 계정 필요 |
| FR-SCH-001 | 날짜별 일정 CRUD | `/schedule`, `/api/schedules`, `/api/schedules/[id]`; 제목·기간·방문 장소 편집/삭제. 메타데이터와 방문 목록을 한 트랜잭션으로 저장 | `src/app/api/schedules/route.test.ts`, `planning-workflows.test.tsx`, 실제 SQL rollback 검증 |
| FR-SCH-002 | AI 일정 자동 생성 | 코스 결과에서 여행 시작일 선택 → 일차별 방문 날짜·시각을 가진 일정 생성 → 해당 일정으로 이동 | `planning-workflows.test.tsx`의 연도 경계 다일 일정, API/SQL 원자적 생성 검증; DB 필요 |
| FR-SCH-003 | 장소 추가·Drag & Drop 정렬 | 관광지·식당·숙박 추가, 마우스/터치 드래그와 이동 버튼, 개별 삭제·날짜/시각·체류시간 편집. DB의 `HH:mm:ss` 응답을 요청 규격으로 정규화 | `src/frontend/schedule-utils.test.ts`, `planning-workflows.test.tsx`, 모바일 E2E |
| FR-SCH-004 | 캘린더·타임라인 | `/schedule` 날짜별 캘린더 카드·방문 순서 타임라인 전환, 31일 초과 기간 표시 보완 | `schedule-utils.test.ts`, `planning-workflows.test.tsx` |
| FR-CART-001 | 관광지·식당·숙박 찜 | `/cart`, `/api/cart`; 장소 상세/목록의 저장 흐름, 사용자 소유 항목 조회·중복 방지·삭제 | `src/app/api/cart/route.test.ts`, `planning-workflows.test.tsx`; DB 필요 |
| FR-CART-002 | 찜 → 일정 추가 | 선택 장소를 기존/새 일정 및 선택한 방문일에 추가. 기존 방문의 순서·시각·메모를 보존하고 같은 날 중복 방지 | `planning-workflows.test.tsx`의 두 번째 일정·다른 날짜 추가; 일정 API/SQL 검증 |
| FR-CART-003 | 저장 목록 분류 | 장바구니 카테고리 탭으로 관광지 세부 분류·식당·숙박을 구분 | `travel-cart-screen.tsx`, 기존 장소 카테고리 매핑 테스트; 모바일 화면 전체 확인은 최종 E2E 결과 참조 |

위 표에서 파일명만 적힌 여행 화면 테스트는 `src/frontend/components/travel/`에, API 상대 경로는 `src/app/api/`에 있다. 과거 문서의 `FR-STP-*` 표기는 이 문서에서 정본의 `FR-STAMP-001~004`로 통일했다.

## 비기능 요구사항 14개

| ID | 기준 | 구현·검증 근거 | 현재 판정 및 남은 확인 |
|---|---|---|---|
| NFR-PERF-001 | 모바일 LTE LCP ≤ 3초 | 반응형 Next Image·AVIF/WebP, 공개 데이터 캐시, 프로덕션 빌드, `scripts/lighthouse-audit.mjs` | **로컬 시뮬레이션 통과**: 로그인 2.275초, 홈 2.902초, 오프라인 2.337초. 실제 단말·배포망·원격 데이터 조건의 실측은 별도 |
| NFR-PERF-002 | API 응답 후 렌더링 ≤ 1초 | 장소 상세 fixture 응답을 반환한 시점부터 제목이 보일 때까지 E2E에서 측정 | **4개 브라우저 환경 모두 1초 미만 통과.** 통제된 단일 상세 응답 기준이며 모든 API·실제 단말의 시간을 보장하지 않음 |
| NFR-PERF-003 | AI 해설 응답 ≤ 5초·로딩 표시 | `narration.ts`, `openai.ts` 캐시·호출 제한·시간 제한·대체 해설, 쇼츠 로딩 표시 | **실제 AI 응답 시간 미검증.** 단위 테스트와 대체 경로 확인이 실제 모델의 5초 충족을 보장하지 않음 |
| NFR-PERF-004 | 동시 접속 100 이상 | `scripts/load-test.mjs` 동시성 100·10회 요청 파동, 오류율/p95 기록 | **공개 API 로컬 통과**: 총 1,000회, 실패 0회, p95 84ms. 인증/업로드/쓰기와 원격 DB를 포함한 전체 서비스 용량은 별도 |
| NFR-I18N-001 | 전체 UI 한·영·중·일 | 전역 locale, 여행·커뮤니티·일정 문구, 스탬프 기본 칭호, 이용약관·개인정보·위치정보 안내 번역 | 주요 화면 전환·사전 구조·컴포넌트 검증. 정책 원문의 한국어 71개 문구 보존 확인. 운영자가 등록하는 콘텐츠의 번역과 원어민 검수는 별도 |
| NFR-I18N-002 | 선택 언어로 AI 해설 생성 | 언어별 원문, 생성 요청 `lang`, 캐시 키 언어 분리, 외국어 안내에서 한국어 원문을 해당 언어 해설로 오인시키지 않도록 처리 | `narration.test.ts`, `openai.test.ts`; 실제 생성 품질·의미 정확성 미검증 |
| NFR-I18N-003 | 다국어 TTS | 언어별 서버 음성 설정과 브라우저 speechSynthesis 언어/음성 선택, 오디오 캐시 | `/audio/route.test.ts`, 플레이어 테스트; 외부 TTS·실제 단말 4개 언어 청취 검수 필요 |
| NFR-SEC-001 | API HTTPS·TLS 1.2 이상 | 서버 제공자 HTTPS 주소, 운영 HSTS·CSP·혼합 콘텐츠 업그레이드 (`next.config.ts`) | HTTPS 호출 경로 확인. 배포 도메인의 TLS 최소 버전·인증서·프록시 설정은 배포 환경에서 검증 필요 |
| NFR-SEC-002 | TourAPI·LLM 키 서버 관리 | `src/backend/`와 API Routes에서만 비밀키 사용, 브라우저에는 공개용 지도 JS 키만 사용, 로그 비밀값 제외 | 빌드·코드 경계 및 공급자 확인 도구 검토. `.env.local`은 배포 비밀 설정으로 관리 |
| NFR-SEC-003 | 개인정보·위치 동의 | 회원가입 시 약관·개인정보 동의를 각각 필수로 받고 서버에서 동의 버전·불리언을 검증해 서버 시각으로 저장. `/api/location-consent`, GPS 동의/권한, 사용자별 API 소유권 | `auth/signup/route.test.ts`, `login/page.test.tsx`, `location-consent.test.ts`, `geolocation.test.ts`, 스탬프 API·E2E; 기존 OAuth 로그인은 유지. 실제 운영자·연락처·고지 내용 확정 필요 |
| NFR-SEC-004 | UGC 비속어·개인정보 필터 | 생성 전/후 다국어 비속어·전화·이메일·민감 식별정보 검사, 승인된 본인 미디어, 이미지 EXIF 제거, 파일 검증·신고/차단 | 텍스트·실제 EXIF 제거·이미지 검사 실패 처리 테스트 통과. 실제 이미지 개인정보 검사는 OpenAI 필요. `FEATURE_AI=false`인 기존 비AI 모드는 사진 검사 불가 상태를 명시하며 검사 성공으로 기록하지 않음 |
| NFR-UX-001 | 모바일 우선 반응형 | 모바일 너비·safe-area·터치 조작·접근 가능한 버튼과 폼, 데스크톱 중앙 레이아웃 | Chromium 모바일/데스크톱·Firefox 데스크톱·WebKit 모바일 55개 E2E 통과·MP4 디코더 제한 1개 제외. 4개 언어 화면에서 가로 넘침 없음 확인 |
| NFR-UX-002 | 이미지·아이콘 중심 UI | 지도 핀, 관광지 사진, 세로 쇼츠, 스탬프 도감·보상, 일정/경로 시각화; 라벨·대체 텍스트 제공 | 지도·쇼츠·일정 컴포넌트 테스트. 실제 외국인 사용자 사용성 평가는 별도 |
| NFR-UX-003 | Service Worker 기본 정보 캐시 | `public/sw.js`, `/offline`, `offline-places.ts`; 공개 관광 정보와 오프라인 화면 자산 캐시, 개인 일정/장바구니/인증 API 캐시 제외 | `service-worker.test.ts`, `offline-places.test.ts`, 모바일 E2E 오프라인 시나리오 |

## 데이터 연동과 운영 준비

| 항목 | 현재 확인 결과 | 재현·후속 작업 |
|---|---|---|
| TourAPI | 읽기 전용 실연결 성공. 카테고리·좌표·상세·행사·식당/숙박 데이터 서버 연동 | `npm run test:providers`, `scripts/sync-tour-places.mjs`; 대상 테이블을 포함한 마이그레이션 적용 후 동기화 |
| Kakao | 읽기 전용 장소 API 실연결 성공. 경로별 성공/실패 및 geometry는 API 계약 테스트로 확인 | 제공자별 모든 이동 모드의 실응답과 브라우저 JS 키 허용 도메인은 추가 확인 |
| 국가유산청 | 공식 HTTPS 목록·상세 XML 실조회 확인; 경주시·정확한 명칭·식별키를 대조하여 보충 정보 연결 | `src/backend/heritage-api.ts`, `heritage-api.test.ts`; 결과가 모호하거나 공급자 실패 시 정보 병합 생략 |
| Supabase | **연결 복구 확인**: 관광지 545건, 좌표 545건, 개요 503건, 큐레이션 3개. 필수 테이블 10개·열 11개·함수 10개 누락, `user_id` 제약 2개 충돌 | 누락 스키마 5개와 호환성 보완 1개, 총 6개 마이그레이션 필요. 현재 데이터 API 키 외 SQL 실행용 연결은 미설정 |
| OpenAI | 키 미설정. 서버 생성·TTS·이미지 moderation 코드는 준비되어 있고 대체 동작/오류 처리를 검증 | `OPENAI_API_KEY`와 모델 접근 권한 설정 후 실제 생성·청취·응답시간 확인 |
| 50곳 × 4개 언어 해설 배치 | 복구 DB에 개요 503건이 있지만 실제 해설·오디오·게시 쇼츠는 0건. `--dry-run` 재실행은 `stamp_targets` 누락(`PGRST205`)으로 종료 | 마이그레이션·대상 동기화 후 `npm run pregenerate:ai -- --dry-run`으로 50곳/200개 예정 수 확인. 실제 배치는 OpenAI 키 필요; 생성 완료로 집계하지 않음 |

새 마이그레이션 두 개는 **로컬 SQL 엔진 검증을 통과했으며 원격 DB에는 적용하지 않았다.** 복구 DB 점검 결과 `20260828000100_shorts_video.sql`, `20260828000200_stamp_hardening_ai.sql`, `20260828000300_release_hardening.sql`의 변경도 누락되어 있다. 이 세 파일을 먼저 적용한 뒤 다음 두 파일을 적용해야 한다.

1. [20260906000100_place_view_ranking.sql](../supabase/migrations/20260906000100_place_view_ranking.sql): 최근 조회 전체 집계 RPC.
2. [20260906000200_course_schedule_workflows.sql](../supabase/migrations/20260906000200_course_schedule_workflows.sql): `create_schedule_with_places`, `update_schedule_with_places`, `save_curated_course`. 일정·큐레이션의 메타데이터와 장소 목록을 한 트랜잭션으로 저장하며 실행 권한을 `service_role`로 제한한다.

복구 DB에서는 `cart_items.user_id`와 `schedules.user_id`가 예전 `NOT NULL` 제약을 유지해 현재 `actor_key` 기반 세션의 저장과 충돌했다. [20260906000300_restored_actor_compatibility.sql](../supabase/migrations/20260906000300_restored_actor_compatibility.sql)을 추가해 이 두 열의 필수 제약만 해제하며 기존 행·FK·RLS는 유지한다. 따라서 현재 적용 대상은 총 **6개**다. [SQL 묶음](../supabase/apply-pending-2026-09-06.sql), [실행 도구](../scripts/migrate-database.mjs), [DB 작업 안내](database-operations-2026-09-06.md)에 선행 검사·단일 트랜잭션·권한 사후 검사·이력 기록과 재실행 절차를 준비했다. `npm run db:plan`에서 SQL 연결 미설정을 확인했으며 원격 적용은 하지 않았다.

복구 후 점검 근거는 [제공자·스키마 결과](../test-results/providers-restored.json), [데이터·저장소 상태](../test-results/database-revived-readonly-audit.json), [실제 CRUD 사전 검사](../test-results/db-live-crud.json)다. 실제 CRUD는 위 제약 충돌을 발견한 사전 검사에서 중단해 임시 데이터를 넣지 않았다. `npm run test:db-live -- --write`는 스키마 적용 후에만 실행하며 생성한 임시 행을 정확한 ID와 소유자로 정리한다.

기존 음성·커뮤니티 저장소는 존재하며 스탬프 이미지 저장소 두 개는 없다. `stamp-artworks` 공개·`stamp-artworks-staging` 비공개 버킷 생성 시도는 **실행 전 자동 승인 검토에서 거절**됐다. 이유는 공개 저장소 생성에 대한 별도 명시적 승인이 필요하다는 것이며, 현재 승인을 요청한 상태다. [결과](../test-results/storage-setup-restored.json)에 `executed:false`로 기록했다. 두 버킷을 포함하는 SQL 묶음도 승인 전 원격 실행하지 않는다.

SQL 검증은 PostgreSQL 18.3/PGlite 0.5.8 격리 환경에서 기존 기본 스키마와 두 신규 migration을 실행했다. 함수 재적용, 1,503건 랭킹, 역할별 권한, 다른 사용자 수정 거부, FK/중복/날짜/체류시간 실패 시 rollback, 공유 토큰 보존 등 **23개 검증이 통과**했다. 결과는 [sql-integration.json](../test-results/sql-integration.json), 재현 스크립트는 [test-sql.mjs](../scripts/test-sql.mjs)이다. 실제 원격 Supabase의 설정·이전 스키마·데이터까지 검증한 결과는 아니다.

복구 DB 대응 추가 검증에서는 7월 스키마와 예전 `NOT NULL` 상태를 만든 뒤 6개 마이그레이션 및 생성 SQL 묶음을 실행해 **28개가 통과**했다. 기존 행 보존·스탬프 후보/미디어 보충·서버 전용 권한·현재 로그인 방식의 저장·재적용·이력 건너뛰기·잘못된 기존 영상 거부·중간 실패 시 DDL/보충 데이터/이력 전체 롤백을 확인했다. [실행 스크립트](../scripts/test-pending-migrations.mjs), [28개 결과](../test-results/pending-migrations-sql-validation.json)를 남겼다.

## 최종 검증 기록

| 검증 | 결과 | 검증 범위 |
|---|---|---|
| 타입검사 | 통과 | `npm run typecheck`; 최종 코드·테스트 포함 |
| lint | 오류 0개·경고 29개 | 배포 준비 보완 후 재검사. React 훅 관련 경고를 기록하며 오류 없이 종료 |
| 단위·컴포넌트·API 테스트 | 77개 파일, 478개 통과 | 배포 준비 보완 후 재검사. 커버리지 Statements 66.12%, Branches 63.29%, Functions 71.46%, Lines 68.35%; 저장소 기준 통과 |
| 배포 도구 회귀 검사 | 20개 통과 | 운영 설정·공급자 검사, 코스 시드의 ID 보존·사전 검증, Windows Android 명령 실행·비밀값 처리 |
| SQL 실제 엔진 | 23개 + 복구 마이그레이션 28개 통과, 실패 0 | PGlite 격리 실행; 원격 migration 적용 미포함 |
| DB 실행 도구 | 6개 통과, 실패 0 | 읽기 전용 기본 모드·SQL 연결 형식·TLS 인증서 검증·롤백 실패 처리 |
| 프로덕션 빌드 | 통과 | `npm run build:test`와 E2E 후 일반 `npm run build` 성공; Next.js webpack 빌드·타입 검사·정적 페이지 생성. 배포 준비 검사 통과를 의미하지 않음 |
| 실제 배포 준비 검사 | **미통과** | `release:check` 결과 `ready:false`; DB 연결 성공·구조/저장소/콘텐츠 미완료, 운영 설정 누락. Vercel 빌드는 이 검사를 먼저 실행하도록 변경 |
| 운영 의존성 audit | 알려진 취약점 0건 | 검사 시점 의존성 기준; 소스 전체 안전성을 보장하는 검사는 아님 |
| E2E·모바일·오프라인 | **55개 통과, 실패 0개, 1개 제외** | 기존 44개와 쇼츠 등록·재생·장애 흐름 12개. Chromium 모바일/데스크톱, Firefox 데스크톱, WebKit 모바일. Windows WebKit의 MP4 디코더 미지원으로 실제 재생 1개만 제외 |
| Lighthouse | 세 경로 모두 LCP 3초 이내·접근성 90점 이상 | `/login` LCP 2.275초·성능 98·접근성 100; `/` 2.902초·95·96; `/offline` 2.337초·98·100 |
| 100 동시 요청 | 1,000회·실패 0회·오류율 0%·p95 84ms | `http://127.0.0.1:3322/api/places?lang=ko&category=all`; 격리된 공개 카탈로그 조회 |
| 실제 외부 연동 | 앞선 TourAPI·Kakao·국가유산·Supabase 읽기 성공; 최신 검사에서 TourAPI 제한 시간 초과 | Supabase 연결은 유지되지만 구조·저장소·콘텐츠 미완료. Google 제공자 비활성 확인; 실제 사용자 인증·AI 생성은 미검증 |

실행 명령은 `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run test:sql`, `npm run test:sql:migrations`, `npm run test:db-tools`, `npm run build:test`, `npm run test:e2e`, `npm run test:lighthouse`, `npm run test:load`, `npm run audit:prod`, `npm run test:providers`이다. SQL 런타임과 브라우저 설치, 일반 운영 빌드 명령은 [README](../README.md)에 있다. Windows PowerShell 실행 정책이 `npm.ps1`을 차단하는 환경에서는 `npm.cmd`를 사용한다.

배포 준비 보완에서는 `npm run test:release-tools`와 `npm run release:check`도 실행했다. SQL·DB 도구·Lighthouse·부하·audit은 앞선 요구사항 검증 기록이며 이번 배포 준비 보완 후 재실행하지 않았다. 최신 실행 로그와 검사의 한계는 [운영 배포 안내](production-release.md#2026-09-06-최종-확인)에 모았다.

E2E·Lighthouse·부하는 외부 제공자 키를 비운 격리 프로덕션 환경이다. E2E의 일부 API는 fixture이며 SQL 저장은 별도 엔진에서 검증했다. WebKit은 로컬 HTTP에서 Secure 쿠키를 보내지 않으므로 테스트 도우미만 loopback 세션 쿠키를 조정한다. 로컬 E2E 프록시에서만 CSP의 `upgrade-insecure-requests`를 제거해 TLS가 없는 테스트 서버의 정적 자산을 읽는다. 나머지 CSP와 운영 인증의 Secure 설정은 그대로 유지하며 실제 HTTPS 로그인을 검증했다는 의미는 아니다. 테스트 도구는 포트 충돌을 거부하고 직접 실행한 서버의 준비 완료를 확인하며 유한 시간 내에 종료한다.

오프라인 검증은 사전 온라인 방문으로 Service Worker 제어권과 HTML·JS·CSS 캐시를 확인한 뒤 수행했다. Chromium·Firefox는 브라우저 오프라인 설정을 사용했다. WebKit의 해당 설정은 캐시 처리 전에 탐색을 내부 오류로 중단하므로, 테스트 전용 로컬 프록시가 앱 연결을 끊는 방식으로 캐시만으로 새 `/offline` 탐색·관광지 설명·운영시간 표시가 되는지 확인했다. 실제 단말 비행기 모드 검증과는 구분한다.

공개 카탈로그는 첫 요청의 제공자 대기를 최대 1.5초로 제한한다. 100개의 동시 콜드 호출을 하나의 조회로 병합하는 테스트, 공급자 복구 후 캐시 갱신, 지연 조회 watchdog 및 요청별 데이터 격리를 확인했다. 이 검증은 실제 원격 DB 처리 용량과 구분한다.

Lighthouse는 Windows 로컬 프로덕션 서버에 모바일 390×844·배율 3·LTE 시뮬레이션 조건으로 각 URL을 1회 측정했다. [최종 측정 JSON](../test-results/lighthouse-summary.json), [초기 측정 JSON](../test-results/lighthouse-before-images.json), [부하 결과](../test-results/load-summary.json)를 남겼다. 초기 로그인/홈 LCP 3.459초/3.657초에서 이미지 전송·우선순위를 보완해 기준을 통과했다. 관광지 카드의 수십 MB 원본을 허용된 이미지 호스트의 작은 AVIF/WebP로 변환하며, 앱 전체의 외부 이미지 호스트를 무제한 허용하지 않는다.

## 미리 제작한 쇼츠 운영 보완

사용자 결정에 따라 `/admin/shorts`에 MP4·YouTube 등록·미리보기·초안 저장·수정·공개/비공개 전환을 추가했다. 완성 영상은 원고 없이 저장하고, 별도 음성 파일이 없으면 AI 해설 버튼을 표시하지 않는다. 장소 상세 링크, 낮은 화면에서도 조작 가능한 카드 높이·스크롤, 긴 제목·소개·태그 표시를 보완했다. 기존 이미지·대본·음성 항목의 편집을 유지하고, 게시 변경으로 정렬이 바뀌면 목록을 첫 페이지부터 갱신해 누락을 방지한다.

관리자 GET은 세션/관리자 비밀키 인증, 공개·초안/언어 필터와 페이지 범위를 검증한다. PATCH는 저장된 데이터와 합친 재생 소스를 검사하고 같은 행이 동시에 바뀌면 충돌을 반환한다. 새 DB 마이그레이션은 추가하지 않았으며 원격 DB·실제 영상은 변경하지 않았다. 운영 설정의 `ADMIN_EMAILS`와 SQL 실행용 연결이 현재 비어 있다. 실제 콘텐츠를 운영하려면 관리자 이메일 지정, 앞 절의 누락 DB 스키마 적용, 영상 준비가 필요하다. [운영 안내](shorts-content-workflow.md)에 등록 순서와 검증 범위를 기록했다.

추가 E2E에서는 자체 제작 320×180·1.338초 H.264 MP4로 Chromium·Firefox의 실제 시간 진행·재생/정지·음소거·저장·태그·장소 이동·AI 요청 없음을 확인했다. 영상 404 대체 화면과 관리자 초안 저장·수정·공개·실패 후 재시도는 네 설정 모두 통과했다. Windows WebKit은 실제 디코딩이 `NotSupportedError`로 실패해 재생 검사를 제외했으며, Safari 실제 단말에서 검증했다는 의미는 아니다. 관리자 저장 API는 fixture이고 실제 원격 DB 저장은 포함하지 않는다. 전체 결과는 [브라우저 로그](../test-results/prerecorded-shorts-e2e-final.log), [385개 테스트](../test-results/prerecorded-shorts-unit.log)에 남겼다. 기존 SQL·Lighthouse·부하 결과는 앞선 전체 요구사항 검증 시점의 기록이다.

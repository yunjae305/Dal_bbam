# 달밤 웹/PWA 배포 준비

**2026-09-19 기준: 운영 배포 완료 — https://dal-bbam.vercel.app.** 아래 2026-09-06 표는 그때의 미완료
항목을 남겨 둔 기록이고, 현재 상태는 바로 아래 표를 본다. 배포 대상은 `vercel.json`의 Next.js 서버 앱이며
정적 HTML 내보내기로 대체할 수 없다. Android 도구는 테스트용 TWA APK이며 스토어 출시 도구가 아니다.

## 현재 상태 (2026-09-19)

| 항목 | 상태 |
|---|---|
| 운영 배포 | Vercel 프로젝트 `dal-bbam`, GitHub main 푸시 시 자동 배포. 빌드 명령 `npm run build:release`는 출시 점검을 통과해야 빌드한다 |
| 출시 점검 | 운영 환경변수 18개 등록 완료. 배포된 `/api/health`의 `configuration.release.ready = true`, 준비 상태 전 항목 true |
| DB·저장소·콘텐츠 | 관광지 545건, 활성 스탬프 대상 9곳, 버킷 정상 |
| 로그인 | 이메일 로그인 실동작 확인. 카카오·구글은 각 로그인 화면 진입까지 확인, 실제 왕복은 사용자 계정 필요 |
| 지도 | **카카오 콘솔에 운영 도메인 미등록 → 운영에서 지도 SDK가 401 `domain mismatched`**. 콘솔 등록만 하면 해결되고 재배포는 불필요 |
| 구글 로그인 복귀 | Supabase Auth Redirect URLs에 `https://dal-bbam.vercel.app/**` 추가 필요 |
| 쇼츠 | 사용자 결정으로 영상 피드는 감춤(`FEATURE_SHORTS` 미설정). 영상 등록 후 `true`로 켠다 |
| AI | `FEATURE_AI=false`. 규칙 기반 추천과 기본 해설로 동작 |

## 2026-09-06 시점 기록

## 현재 남은 항목

| 항목 | 확인한 상태 | 완료에 필요한 작업 |
|---|---|---|
| 운영 DB | 실제 연결과 관광지 545건 확인, 필수 테이블·열·RPC 누락 및 `user_id` 제약 충돌 | SQL 연결 설정 후 준비된 6개 마이그레이션 적용·사후 검사·실제 저장 검증 |
| 스탬프 저장소 | 공개/비공개 이미지 버킷 2개 누락 | 아래 승인 상태 확인 후 DB 적용, 검증된 위치의 스탬프 대상 동기화 |
| 운영 주소 | 로컬 HTTP 주소, Vercel 프로젝트 연결 없음 | 운영 HTTPS 주소·프로젝트 지정, 카카오 SDK 도메인·콜백과 Supabase 리다이렉트 목록 등록 |
| 계정·정책 | 관리자·운영자명·문의 이메일·시행일 미설정 | 실제 운영 주체와 관리자 계정 정보를 지정 |
| 로그인 | Google 제공자 비활성, 이메일 가입·메일 인증은 설정상 활성 | 사용할 Google 제공자 설정 및 실제 가입 메일·Google/Kakao 콜백·로그아웃 검증 |
| AI | OpenAI 키 없음, 현재 개발 설정은 AI 사용 여부도 미지정 | `FEATURE_AI`를 명시하고, AI 사용 시 API 키·실제 추천/생성 검증. `false`이면 기본 추천만 사용 |
| 쇼츠 | 실제 문화재 영상 미등록 | MP4·YouTube 콘텐츠 준비, 관리자 초안 검수·공개, 실제 모바일 영상·음성 확인 |
| TourAPI | 이전 읽기 성공, 이번 운영 점검에서는 8초 제한 내 응답 실패 | 제공자 응답이 복구되면 읽기 검사 재확인 |

스탬프 버킷 생성은 이전 자동 승인 검토에서 **공개 저장소 생성에 대한 명시적 승인이 필요**하다는 이유로 실행 전에 거절됐다. `stamp-artworks`는 누구나 URL로 읽는 승인 이미지 저장소, `stamp-artworks-staging`은 비공개 검토용 저장소다. 둘 다 PNG/JPEG/WebP·10MB 제한이며 승인 전에는 버킷 생성을 포함한 SQL도 원격 실행하지 않는다. SQL 접속 정보와 공개 저장소 승인은 별개로 필요하다. [DB 적용 안내](database-operations-2026-09-06.md)

## 운영 설정 준비

비밀값 없는 예시는 [`.env.production.example`](../.env.production.example)에 있다. 현재 보유한 공급자 설정을 복사하고 정기 정리·관리자 API 비밀키를 생성한 **비공개 초안**은 Git 제외 경로 `artifacts/release/.env.production.local`에 준비했다. 이 파일은 자동 적용되지 않으며, 빈 운영 주소·관리자·정책·AI 모드를 채워야 한다. 파일 내용이나 비밀키를 채팅·커밋에 붙이지 않는다. 기존 `.env.local`은 변경하지 않았다.

- `FRONTEND_URL`: 실제 HTTPS 오리진. 경로·쿼리·로컬/예시 주소는 사용하지 않는다.
- `KAKAO_REDIRECT_URI`: 같은 오리진의 `/api/auth/kakao/callback`.
- `KAKAO_MAP_JS_ALLOWED_ORIGINS`: 카카오 콘솔에도 실제 등록한 운영 오리진 목록. 환경변수 값만 넣는다고 콘솔 등록이 되지는 않는다.
- `ADMIN_EMAILS`: 실제 로그인할 관리자 계정. 데모 계정은 운영 관리자 권한을 얻지 못한다.
- `PUBLIC_OPERATOR_NAME`, `PRIVACY_CONTACT_EMAIL`, `LOCATION_TERMS_EFFECTIVE_DATE`: 실제 운영 정보.
- `JWT_SECRET`, `CRON_SECRET`: 예시값이 아닌 32자 이상의 무작위 서버 비밀키. Vercel 정기 작업은 설정된 `CRON_SECRET`을 Authorization 헤더로 전달한다. [Vercel 정기 작업 문서](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- `DEMO_MODE_ENABLED=false`, `DEMO_ISOLATED_TEST=false`: 공개 배포에서는 반드시 비활성화한다.
- `FEATURE_SHORTS=true`: 쇼츠 영상 피드를 여는 스위치. 넣지 않으면 사용자 화면에 "추후 추가 예정" 안내가 보이고, 출시 점검도 게시된 영상을 요구하지 않는다.
- `FEATURE_AI=true|false`: 명시적인 초기 운영 결정. `true`는 OpenAI 키와 모델 접근이 필요하며 실제 생성·음성 품질 검증도 별도로 진행한다. Claude 구독 로그인 연결은 현재 앱에 구현하지 않았다.

Vercel은 Preview와 Production의 환경변수를 구분한다. 대상 환경에 실제 값을 설정한 후 빌드해야 하며 브라우저용 `NEXT_PUBLIC_*` 값은 빌드에 반영된다. `.vercelignore`는 로컬 환경 파일, 테스트 결과, 비공개 초안·Android 테스트 키/산출물을 배포 업로드에서 제외한다. [Vercel 환경 구분](https://vercel.com/docs/deployments/environments), [환경변수 문서](https://vercel.com/docs/environment-variables)

## 배포 순서

1. DB 연결과 승인 조건을 완료하고 `npm run db:plan`으로 적용 대상을 확인한다. [DB 적용 안내](database-operations-2026-09-06.md)의 순서대로 마이그레이션을 적용한다. 7월 복원 파일 전체를 다시 실행하지 않는다.
2. `npm run test:providers`로 스키마·함수·nullable 조건·버킷 설정을 확인한다. 필요 시 `npm run sync:tour`로 실제 장소와 스탬프 대상을 준비한다. `seed:courses`는 모든 장소와 중복을 먼저 확인한 뒤 원자적 RPC로 기존 ID·공유 토큰을 보존한다. 중복 이름이나 빠진 장소가 있으면 수정 전 중단한다.
3. `npm run test:db-live -- --write`로 임시 계정 식별자의 실제 CRUD를 확인한다. 현재 도구의 자동 범위는 장바구니·일정 헤더이며, 실제 로그인 세션의 일정 RPC·스탬프·업로드까지 검증했다는 뜻이 아니다. 이 흐름은 운영 후보에서 별도로 실행해 저장·새로고침 후 유지·권한·정리를 확인한다.
4. [쇼츠 운영 안내](shorts-content-workflow.md)에 따라 실제 영상을 등록한다. 준비 검사는 공개된 영상 소스 문자열의 형식과 연결 장소를 확인하며 외부 영상 파일의 존재·청취·YouTube 임베드 허용을 확인하지는 않는다.
5. 대상 배포 환경변수를 적용하고 아래 검사를 실행한다. 준비되지 않은 상태는 종료 코드 1로 중단한다. `vercel.json`도 이 검사를 먼저 실행하도록 연결했다.

   ```powershell
   npm.cmd run release:check -- --configuration-only
   npm.cmd run release:check
   npm.cmd run build:release
   ```

6. Vercel 프로젝트·도메인이 지정되고 후보가 준비되면 검토한 배포를 진행한다. 이 작업에서는 Vercel 계정 연결·배포·도메인 변경을 수행하지 않았다.
7. 배포된 실제 오리진에서 상태와 사용자 흐름을 확인한다.

   ```powershell
   npm.cmd run release:check -- --base-url https://실제-운영-도메인
   ```

   `/api/health`가 200이고 `ok:true`여야 한다. 반환값은 준비 상태이며 실제 이메일 발송, Google/Kakao 로그인, 길찾기, GPS, AI 생성, 영상 재생의 완료 증명이 아니다. 응답의 `verification`과 CLI의 `actualUserFlows:not_run` 표시를 확인한다. 실제 기기에서는 로그인→일정 생성·수정→새로고침→장바구니→스탬프→커뮤니티→쇼츠→로그아웃 흐름을 검증한다.

## 자동 검사의 범위

`release:check`는 읽기 전용이다. 운영 설정, 실제 제공자 응답, DB 스키마·RPC 노출·랭킹 읽기 실행, 버킷 공개 여부·10MB·파일 형식 제한, 실제 장소·활성 스탬프·공개 영상 참조를 확인한다. 버킷·행·계정 생성이나 메일 발송, AI 생성·DB 마이그레이션은 실행하지 않는다. `--configuration-only` 통과는 설정값 검사만 통과했다는 뜻이다.

`/api/health`는 같은 DB 검사 코드를 사용하며 연결 성공만으로 정상 판정하지 않는다. DB 검사는 총 8초 제한, 상태 캐시는 30초이며 동시 상태 요청을 병합한다. 공개 응답에 키·사용자 행·환경변수 값을 포함하지 않는다. 상세 누락 객체와 개수는 서버에서 실행하는 `test:providers`로 확인한다.

`build:test`는 모든 실제 키를 비운 격리 테스트 산출물이다. 운영 산출물로 배포하지 않는다. 기존처럼 개발 확인을 위한 `npm run build`는 가능하지만 배포 선행 검사를 대신하지 않는다.

## 2026-09-06 최종 확인

| 검사 | 결과 | 범위·근거 |
|---|---|---|
| 단위·컴포넌트·API | 77개 파일·478개 통과 | [실행 로그](../test-results/release-unit.log); 커버리지 Statements 66.12%, Branches 63.29%, Functions 71.46%, Lines 68.35% |
| 배포·공급자·시드·Android 도구 | 20개 통과 | [실행 로그](../test-results/release-tools.log); 실제 배포·시드 쓰기·APK 생성은 수행하지 않음 |
| 브라우저 E2E | 55개 통과·실패 0개·제외 1개 | [실행 로그](../test-results/release-e2e.log); 격리 환경의 4개 브라우저 설정. Windows WebKit MP4 디코더 미지원 사례 제외 |
| 정적 검사 | 타입검사 통과, lint 오류 0개·경고 29개 | [타입검사](../test-results/release-typecheck.log), [lint](../test-results/release-lint.log) |
| 빌드 | 일반·격리 테스트 빌드 통과 | [일반 빌드](../test-results/release-production-build.log), [테스트 빌드](../test-results/release-build-test.log); E2E 후 일반 빌드로 `.next` 재생성 |
| 실제 배포 준비 검사 | **실패: `ready:false`** | [비밀값을 제외한 결과](../test-results/release-readiness-current.json); DB 연결은 성공했으나 스키마·저장소·콘텐츠 준비 실패, 운영 설정 누락, TourAPI 제한 시간 초과 |

Supabase 인증 설정의 읽기 응답에서 Google 제공자가 비활성화된 것을 확인했다. 로그인 화면과 Google 진입 API는 제공자 상태를 확인해 사용할 수 없는 로그인을 안내한다. 운영 환경의 공용 데모 로그인은 차단하며, 실제 외부 자격증명을 모두 비우고 loopback 주소를 사용하는 명시적 격리 테스트만 예외로 허용한다.

SQL 51개·DB 도구 6개, Lighthouse·100 동시 요청·의존성 검사는 같은 날 앞선 요구사항 검증의 결과이며 이번 보완 후 재실행한 결과와 구분한다. [요구사항 추적표](requirements-implementation-2026-09-06.md)에 해당 근거가 있다. 현재 SQL 실행용 연결, Vercel 프로젝트 연결, 제어 가능한 로그인 브라우저가 없어 대시보드 설정과 원격 적용을 완료하지 못했다. 실제 HTTPS 배포·OAuth 왕복·가입 메일 수신·현장 GPS·운영 DB 저장·AI 생성·실제 문화재 영상 재생은 아직 검증하지 않았다.

## Android

현재 `android:apk`는 디버그 서명·테스트 설치용이다. 테스트 연결 JSON은 `android/dist/assetlinks-debug.json`에 만들고 운영 `public/.well-known/assetlinks.json`을 덮어쓰지 않는다. 현재 운영 경로의 기존 JSON도 테스트 인증서와 연결된 상태라 실제 출시용 인증서로 검토·교체해야 한다. Google Play 출시는 패키지·개발자 계정·업로드 키/앱 서명·증가하는 versionCode·AAB·정식 인증서 연결과 심사 준비가 추가로 필요하다. 실제 APK 생성·설치·스토어 업로드는 이번 검증에 포함하지 않았다.

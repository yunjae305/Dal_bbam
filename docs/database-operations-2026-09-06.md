# 복원된 Supabase DB 마이그레이션

2026-09-06 읽기 검사에서 관광지 545개와 7월 스키마는 확인됐지만, 8월 28일 이후 테이블·컬럼·함수는 없었다. 복원된 `cart_items.user_id`와 `schedules.user_id`는 여전히 `NOT NULL`이어서 Supabase UUID가 없는 서버 세션의 저장도 실패한다. `courses.user_id`와 `stamps.user_id`는 이미 nullable이다. 읽기 검사는 실제 FK 정의 전체를 보여 주지 않으므로 기존 FK는 변경하지 않는다.

**원격 적용 대기 상태:** 현재 SQL 연결용 `DATABASE_URL`/`SUPABASE_DB_URL`은 설정되지 않았다. 또한 공개 `stamp-artworks`와 비공개 `stamp-artworks-staging` 버킷 생성은 자동 승인 심사에서 공개 저장소에 대한 명시적 동의가 필요하다는 사유로 거절됐다. 두 버킷은 파일당 10 MB, PNG/WebP/JPEG로 제한되며, 공개 버킷에 넣은 승인 이미지는 로그인 없이 읽을 수 있다. 사용자에게 별도 동의를 요청한 상태이므로 이 동의와 SQL 연결이 준비되기 전에는 같은 버킷 생성을 포함한 SQL 묶음도 원격 실행하지 않는다. 로컬 SQL 생성·검증은 진행할 수 있다.

준비된 [SQL 묶음](../supabase/apply-pending-2026-09-06.sql)은 다음 6개만 순서대로 적용한다.

| 순서 | 마이그레이션 | DB 변경 |
|---|---|---|
| 1 | `20260828000100_shorts_video.sql` | 영상 컬럼·형식 제약·조회 인덱스 |
| 2 | `20260828000200_stamp_hardening_ai.sql` | 스탬프 대상·이미지 검토·체크포인트·리워드, 저장소 버킷·서버 RPC |
| 3 | `20260828000300_release_hardening.sql` | 세션·댓글·신고·차단, 미디어 관리 컬럼·서버 RPC |
| 4 | `20260906000100_place_view_ranking.sql` | 전체 조회수 집계 RPC |
| 5 | `20260906000200_course_schedule_workflows.sql` | 일정 생성/편집·관리자 코스 저장 RPC |
| 6 | `20260906000300_restored_actor_compatibility.sql` | 장바구니·일정의 `user_id` 필수 제한 해제 |

적용 시 기존 스탬프는 대상 ID를 보충하고, 유효 좌표의 장소는 **비활성 후보**로 등록한다. 기존 임시 미디어에는 만료 시각을, 승인 미디어에는 삭제 가능한 저장소 경로를 보충한다. 스탬프 버킷의 공개 여부·파일 형식 제한을 명시하며, 개인 테이블/RPC 권한을 서버 전용으로 제한한다. 장소·일정·장바구니·게시물 행을 삭제하지 않는다. 삭제 기능을 제공하는 RPC의 정의를 추가하지만 마이그레이션 중 호출하지 않는다.

`supabase/restore-2026-07-31.sql`을 다시 실행하면 중복 장바구니 삭제와 과거 GPS 제거도 수행한다. 이번 적용에는 이 복구 파일이나 7월 마이그레이션을 포함하지 않는다. 7월 일정 복구 마이그레이션은 방문 순서도 재번호화하므로 “모든 과거 파일 재실행”으로 대체하지 않는다.

## 연결과 실행

현재 앱의 `NEXT_PUBLIC_SUPABASE_URL`과 `SUPABASE_SECRET_KEY`는 HTTPS 데이터 API용이며 SQL 실행 연결을 대신하지 않는다. 직접 SQL 실행에는 DB 비밀번호를 포함한 PostgreSQL URI를 `DATABASE_URL` 또는 `SUPABASE_DB_URL`로 설정한다. Supabase 대시보드의 Connect에서 Direct 또는 Session pooler URI를 가져온다. 비밀번호의 예약 문자는 URL 인코딩하고, URI를 코드·커밋·로그에 넣지 않는다. [Supabase 연결 안내](https://supabase.com/docs/guides/database/connecting-to-postgres)

SQL 클라이언트는 앱 의존성과 분리된 Git 제외 폴더에 설치한다. 아래 명령은 Windows PowerShell 기준이다.

```powershell
npm.cmd install --prefix test-results/db-runtime --no-save --ignore-scripts --no-audit --no-fund pg@8.16.3
node --env-file=.env.local scripts/migrate-database.mjs --plan
node --env-file=.env.local scripts/migrate-database.mjs --apply
node --env-file=.env.local scripts/migrate-database.mjs --plan
```

기본 실행과 `--plan`은 읽기 전용 트랜잭션에서 선행 스키마·기존 영상 값·기록된 버전을 검사한다. `--apply`만 DB를 변경한다. 전체 6개 적용·마이그레이션 이력·사후 검증은 하나의 트랜잭션이며, 기존 파일의 내부 `BEGIN/COMMIT`은 생성 시 제거한다. 잠금 제한 5초, SQL 제한 90초와 마이그레이션 전용 advisory lock을 사용한다. 적용된 버전은 `supabase_migrations.schema_migrations`에 기록하고 다음 실행에서 건너뛴다. 기록된 버전의 객체가 없거나 RPC 권한이 잘못되면 사후 검사가 실패한다. 실패 시 롤백하며, 연결이 끊겨 커밋 결과가 불명확하면 다시 `--plan`으로 원격 상태를 먼저 확인한다.

원격 PostgreSQL 연결은 인증서 검증을 켠 TLS를 사용한다. 필요한 경우 제공자의 CA 인증서 파일을 `DATABASE_SSL_CA_FILE`로 지정한다. 인증서 오류를 해결하기 위해 TLS 검증을 끄지 않는다. 평문 연결은 로컬 PostgreSQL 검증용 loopback 주소만 허용한다.

대시보드 SQL Editor를 사용한다면 [SQL 묶음](../supabase/apply-pending-2026-09-06.sql) 전체를 한 번에 실행한다. 중간의 일부 문장만 실행하지 않는다. 원본 파일을 수정한 뒤에는 아래 명령으로 묶음을 다시 생성한다.

```powershell
node scripts/migrate-database.mjs --write-bundle
node --test scripts/migrate-database.test.mjs
npm.cmd run test:sql:migrations
```

격리 PostgreSQL 18.3/PGlite 0.5.8에서 [마이그레이션 검증 스크립트](../scripts/test-pending-migrations.mjs) 28개 검증을 통과했다. 실제 7월 파일 5개와 복원된 `NOT NULL` 제약을 재현한 뒤 생성 SQL 전체 적용, UUID 없는 actor 저장, 적용 이력에 따른 재실행, 기존 영상 충돌의 사전 거부, 중간 오류 시 DDL·보충 데이터·이력의 전체 롤백을 확인했다. SQL 클라이언트의 TLS·기본 읽기 모드·오류 롤백 테스트 6개도 통과했다. 이는 원격 DB 적용 완료를 뜻하지 않는다. 결과는 [pending-migrations-sql-validation.json](../test-results/pending-migrations-sql-validation.json)에 기록한다.

Supabase CLI를 이미 사용하는 환경은 먼저 `supabase migration list`, `supabase db push --dry-run`으로 기록과 실행 대상을 대조한다. 복원된 DB의 과거 이력이 없다고 7월 파일을 다시 실행하거나 확인 없이 과거 버전을 `migration repair`로 표시하지 않는다. 이번 도구는 검증된 7월 스키마를 전제로 이후 6개 버전만 기록한다. [Supabase 마이그레이션 CLI](https://supabase.com/docs/reference/cli/supabase-migration-up)

## 적용 후 확인

`node --env-file=.env.local scripts/verify-providers.mjs`로 누락 테이블·컬럼·함수·버킷과 nullable 조건을 다시 확인한다. `scripts/verify-db-crud.mjs`의 선행 검사를 통과한 뒤 실제 저장·읽기·수정·삭제 흐름을 검증한다. 원격 저장 검증 결과와 로컬 PostgreSQL 검증 결과는 별도로 기록한다.

스탬프 대상은 마이그레이션만으로 활성화되지 않는다. 이후 `npm.cmd run sync:tour`가 검증된 좌표·테마의 대상을 활성화한다. 코스 기본 데이터는 `npm.cmd run seed:courses`로 준비할 수 있다. AI는 별도 키가 필요하며 `npm.cmd run pregenerate:ai -- --dry-run`은 원문·대상 수만 검사한다. 실제 생성 실행과 200개 해설/TTS 완성 여부를 동일하게 취급하지 않는다.

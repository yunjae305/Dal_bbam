# DB 작업 요청 (2026-09-11)

운영 Supabase는 **이미 연결된다.** 관광지 545건도 들어 있다.
남은 작업은 **마이그레이션 6개 적용** 하나뿐이다.
스탬프 이미지 버킷 2개는 그 마이그레이션 안에 포함돼 있어 함께 생성된다.

아래를 위에서 아래로 그대로 따라 하면 된다. 15분이면 끝난다.

> **필요한 권한:** GitHub 저장소 접근, Supabase 대시보드 접근(연결 문자열 확인용)
> **필요한 환경:** Node 22.19 이상
> **다른 비밀 키는 필요 없다.** 이 작업에 쓰는 값은 Postgres 연결 문자열 하나뿐이다.

---

## 0단계 · 저장소 준비

이미 받아 놓았다면 `git pull`만 하고 넘어간다.

```bash
git clone https://github.com/yunjae305/Dal_bbam.git
cd Dal_bbam
npm ci

# 마이그레이션 도구가 쓰는 Postgres 드라이버 (저장소에 포함되지 않는다)
npm install --prefix test-results/db-runtime --no-save --ignore-scripts --no-audit --no-fund pg@8.16.3
```

---

## 1단계 · Postgres 연결 문자열 가져오기

마이그레이션 도구는 **Postgres 연결 URI**가 있어야 한다. Supabase HTTPS API 키로는 스키마를 바꿀 수 없다.

1. Supabase 대시보드 → 프로젝트 선택
2. 왼쪽 아래 **Project Settings** → **Database**
3. **Connection string** 항목에서 **URI** 탭 선택
4. 문자열을 복사한다. `[YOUR-PASSWORD]` 부분은 실제 DB 비밀번호로 바꿔 넣어야 한다

이런 모양이다.

```
postgresql://postgres.abcdefghijk:실제비밀번호@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres
```

---

## 2단계 · `.env.local` 파일 만들기

저장소 최상위(= `package.json`이 있는 폴더)에 **`.env.local`** 이라는 이름으로 파일을 만들고,
아래 한 줄만 넣는다. `<1단계에서 복사한 값>` 자리에 붙여넣으면 된다.

```
DATABASE_URL=<1단계에서 복사한 값>
```

파일 전체가 이 한 줄이면 된다. 다른 값은 필요 없다.
`.env.local`은 git 제외 대상이라 커밋되지 않는다. **연결 문자열을 채팅·커밋에 붙여넣지 말 것.**

<details>
<summary>명령으로 만들고 싶다면 (PowerShell)</summary>

```powershell
'DATABASE_URL=여기에붙여넣기' | Out-File -Encoding utf8 .env.local
```
</details>

---

## 3단계 · 적용 대상 확인 (읽기 전용, 아무것도 바꾸지 않음)

```bash
npm run db:plan
```

출력의 `pending` 목록에 **아래 6개가 그대로** 나와야 한다.

```
20260828000100_shorts_video.sql
20260828000200_stamp_hardening_ai.sql
20260828000300_release_hardening.sql
20260906000100_place_view_ranking.sql
20260906000200_course_schedule_workflows.sql
20260906000300_restored_actor_compatibility.sql
```

**목록이 다르면 여기서 멈추고 출력을 공유해 달라.** 특히 `20260731000000_restore_schema_repair.sql`
(7월 복원 파일)이 목록에 보이면 실행하지 말고 알려 달라.

`Configure DATABASE_URL or SUPABASE_DB_URL ...` 이 뜨면 2단계의 `.env.local`이 잘못된 것이다.

---

## 4단계 · 적용

```bash
npm run db:apply
```

적용 이력을 `supabase_migrations.schema_migrations` 테이블에 기록하고 **이미 적용된 것은 건너뛴다.**
중간에 끊겨도 다시 실행하면 되고, 여러 번 돌려도 안전하다.

성공하면 `"postflight": "passed"` 가 출력된다.

확인:

```bash
npm run db:plan
```

이번에는 `pending` 이 **빈 배열**이어야 한다.

---

## 5단계 · 버킷은 자동으로 만들어진다 (할 일 없음)

스탬프 이미지 버킷 2개는 **`20260828000200_stamp_hardening_ai.sql` 안에 이미 들어 있다.**
4단계를 실행하면 아래 두 개가 자동으로 생성되고 공개 읽기 정책까지 설정된다.
대시보드에서 손으로 만들 필요가 없다.

| 버킷 | 공개 여부 | 제한 |
|---|---|---|
| `stamp-artworks` | **공개 (public = true)** | 10MB, PNG·JPEG·WebP |
| `stamp-artworks-staging` | 비공개 (public = false) | 10MB, PNG·JPEG·WebP |

> ⚠️ `stamp-artworks` 는 **인터넷에 공개되는 저장소**다. 누구나 URL로 이미지를 읽을 수 있고,
> 4단계를 실행하는 순간 만들어진다. 승인된 스탬프 보상 이미지만 여기 올라간다.
> 이 점을 알고 진행해 달라. 곤란하면 4단계 전에 알려 달라.

---

## 6단계 · 끝났는지 확인하고 알려주기

```bash
npm run db:plan
```

`pending` 이 빈 배열이면 끝이다. 버킷은 4단계에서 함께 생성됐다. **완료됐다고 알려주면 된다.**

최종 검증(`npm run test:providers`)은 Supabase API 키가 필요해서 이쪽에서 돌린다.
그때 아래처럼 나오면 전부 통과다.

```
database  configured=true operational=true reachable=true schemaReady=true storageReady=true contentReady=true
```

---

## 무엇이 살아나는가

지금은 아래 기능이 전부 죽어 있다. 이 작업이 끝나면 동작한다.

| 마이그레이션 | 살아나는 기능 |
|---|---|
| `shorts_video` | 쇼츠 영상 등록 (`video_url`, `youtube_video_id`) |
| `stamp_hardening_ai` | 스탬프 투어 — 체크포인트, 보상, 중복 발급 방지 |
| `release_hardening` | 영속 세션, 커뮤니티 댓글·신고·차단, 계정 삭제, 정기 정리 |
| `place_view_ranking` | 조회수 기반 인기 랭킹 |
| `course_schedule_workflows` | 일정·코스 저장 |
| `restored_actor_compatibility` | 사용자 식별자 호환 |

합쳐서 **테이블 10개, 컬럼 14개, 함수 10개**가 생긴다. SQL을 손으로 쓸 일은 없다.

<details>
<summary>누락 항목 상세 (참고용, 읽지 않아도 됨)</summary>

**테이블 10개**
`stamp_targets`, `stamp_artworks`, `stamp_checkpoint_tokens`, `stamp_reward_definitions`,
`user_stamp_rewards`, `community_comments`, `community_reports`, `user_blocks`,
`app_sessions`, `auth_actor_identities`

**컬럼 14개**
- `shorts`: `video_url`, `youtube_video_id`
- `stamps`: `stamp_target_id`, `checkpoint_id`, `checkpoint_verified_at`
- `community_media`: `expires_at`, `public_storage_path`, `processed_sha256`, `width`, `height`, `deleted_at`

**함수 10개**
`consume_stamp_checkpoint`, `claim_stamp`, `approve_stamp_artwork`, `create_community_post`,
`delete_actor_data`, `cleanup_expired_runtime_data`, `get_place_view_ranking`,
`update_schedule_with_places`, `create_schedule_with_places`, `save_curated_course`
</details>

---

## 막히면

- `db:plan` 목록이 위 6개와 다름 → 실행하지 말고 출력 공유
- `Configure DATABASE_URL ...` → `.env.local` 위치·내용 확인 (저장소 최상위, `DATABASE_URL=` 한 줄)
- `migration_history_schema_mismatch` 오류 → 멈추고 공유. 기존 이력 테이블 구조 문제라 판단이 필요하다
- 연결 타임아웃 → 연결 문자열의 비밀번호와 리전이 맞는지 확인

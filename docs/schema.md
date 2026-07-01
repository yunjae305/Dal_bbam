# 달빔 DB 스키마 문서

> 데이터베이스: Supabase (PostgreSQL)  
> 작성일: 2026-07-01

---

## 테이블 목록

| 테이블 | 설명 |
|---|---|
| places | 경주 관광지 정보 |
| schedules | 사용자 여행 일정 |
| schedule_places | 일정 내 장소 목록 |
| cart_items | 여행 장바구니 |
| courses | 추천 코스 |
| course_places | 코스 내 장소 목록 |
| reviews | 리뷰 및 커뮤니티 게시물 |
| stamps | 스탬프 획득 기록 |

---

## places — 관광지

TourAPI 데이터를 저장하는 핵심 테이블. AI 해설도 여기에 캐싱.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID | 기본키 (자동 생성) |
| content_id | TEXT | TourAPI contentId (중복 방지용) |
| category | TEXT | 문화재 / 음식점 / 숙박 / 축제 |
| name | TEXT | 관광지 이름 |
| description | TEXT | 기본 설명 (TourAPI overview) |
| address | TEXT | 주소 |
| lat | FLOAT | 위도 |
| lng | FLOAT | 경도 |
| image_url | TEXT | 대표 이미지 URL |
| tags | TEXT[] | 태그 배열 |
| ai_description_ko | TEXT | AI 생성 한국어 해설 |
| ai_description_en | TEXT | AI 생성 영어 해설 |
| ai_description_zh | TEXT | AI 생성 중국어 해설 |
| ai_description_ja | TEXT | AI 생성 일본어 해설 |
| created_at | TIMESTAMPTZ | 생성일시 |

---

## schedules — 여행 일정

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID | 기본키 |
| user_id | UUID | 사용자 ID (Supabase Auth) |
| title | TEXT | 일정 제목 |
| start_date | DATE | 여행 시작일 |
| end_date | DATE | 여행 종료일 |
| created_at | TIMESTAMPTZ | 생성일시 |

---

## schedule_places — 일정 내 장소

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID | 기본키 |
| schedule_id | UUID | schedules.id 참조 |
| place_id | UUID | places.id 참조 |
| visit_date | DATE | 방문 날짜 |
| order_index | INT | 순서 (Drag & Drop용) |
| memo | TEXT | 메모 |

---

## cart_items — 여행 장바구니

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID | 기본키 |
| user_id | UUID | 사용자 ID |
| place_id | UUID | places.id 참조 |
| created_at | TIMESTAMPTZ | 찜한 일시 |

---

## courses — 코스

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID | 기본키 |
| user_id | UUID | 사용자 ID (null이면 큐레이션 코스) |
| title | TEXT | 코스 제목 |
| description | TEXT | 코스 설명 |
| is_ai_generated | BOOLEAN | AI 생성 여부 |
| created_at | TIMESTAMPTZ | 생성일시 |

---

## course_places — 코스 내 장소

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID | 기본키 |
| course_id | UUID | courses.id 참조 |
| place_id | UUID | places.id 참조 |
| order_index | INT | 방문 순서 |

---

## reviews — 리뷰 / 커뮤니티

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID | 기본키 |
| user_id | UUID | 작성자 ID |
| place_id | UUID | places.id 참조 |
| content | TEXT | 리뷰 내용 |
| rating | INT | 별점 (1~5) |
| images | TEXT[] | 이미지 URL 배열 |
| created_at | TIMESTAMPTZ | 작성일시 |

---

## stamps — 스탬프

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID | 기본키 |
| user_id | UUID | 사용자 ID |
| place_id | UUID | places.id 참조 |
| acquired_at | TIMESTAMPTZ | 스탬프 획득 일시 |
| lat | FLOAT | 획득 당시 위도 (GPS 검증용) |
| lng | FLOAT | 획득 당시 경도 (GPS 검증용) |

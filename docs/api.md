# 달빔 API 문서

> Base URL: `http://localhost:3000` (개발) / Vercel 도메인 (배포)  
> 모든 요청/응답은 `Content-Type: application/json`

---

## 인증 (Auth)

### 회원가입
`POST /api/auth/signup`

**Request Body**
```json
{ "email": "user@example.com", "name": "홍길동", "password": "123456" }
```

**Response**
```json
{ "success": true, "needsEmailVerification": true }
```
> 가입 후 인증 메일 발송됨. 메일의 링크 클릭 시 `/api/auth/callback`으로 이동하여 인증 완료.

---

### 로그인
`POST /api/auth/login`

**Request Body**
```json
{ "email": "user@example.com", "password": "123456" }
```

**Response**: 세션 쿠키 설정 후 `{ "success": true }`

---

### 로그아웃
`POST /api/auth/logout`

**Response**: 세션 쿠키 삭제 후 `{ "success": true }`

---

### 카카오 로그인
`GET /api/auth/kakao` → 카카오 OAuth 페이지로 리다이렉트

---

## 관광지 (Places)

### 관광지 목록 조회
`GET /api/places`

**Query Parameters**
| 파라미터 | 타입 | 설명 |
|---|---|---|
| `category` | string | `문화재` / `음식점` / `숙박` / `축제` (기본값: 전체) |
| `q` | string | 검색어 (이름, 주소, 태그) |
| `lang` | string | `ko` / `en` / `ja` / `zh` (기본값: `ko`) |

**Response**
```json
{
  "items": [
    {
      "id": "133964",
      "category": "음식점",
      "name": "요석궁1779",
      "description": "...",
      "address": "경상북도 경주시 ...",
      "lat": 35.83,
      "lng": 129.21,
      "image": "https://...",
      "tags": ["음식점"],
      "coordinates": [35.83, 129.21],
      "rating": 4.7,
      "distance": "경주"
    }
  ]
}
```

---

### 관광지 상세 조회
`GET /api/places/[id]`

**Path Parameter**: `id` — `content_id` 또는 UUID

**Query Parameters**
| 파라미터 | 타입 | 설명 |
|---|---|---|
| `lang` | string | `ko` / `en` / `ja` / `zh` (기본값: `ko`) |

**Response**
```json
{
  "item": {
    "id": "133964",
    "category": "음식점",
    "name": "요석궁1779",
    "description": "...",
    "address": "경상북도 경주시 ...",
    "lat": 35.83,
    "lng": 129.21,
    "image": "https://...",
    "tags": [],
    "translations": {
      "en": { "description": "..." },
      "ja": { "description": "..." },
      "zh": { "description": "..." }
    }
  }
}
```

---

## 여행 일정 (Schedules)

### 일정 목록 조회
`GET /api/schedules`

> 로그인 세션 쿠키 필요 (미로그인 시 401)

**Response**
```json
{
  "items": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "title": "경주 2박3일",
      "start_date": "2026-08-01",
      "end_date": "2026-08-03",
      "schedule_places": [ ... ]
    }
  ]
}
```

---

### 일정 생성
`POST /api/schedules`

> 로그인 세션 쿠키 필요 (미로그인 시 401)

**Request Body**
```json
{
  "title": "경주 2박3일",
  "start_date": "2026-08-01",
  "end_date": "2026-08-03"
}
```

**Response**: 생성된 일정 객체 (status 201)

---

### 일정 수정
`PATCH /api/schedules/[id]`

**Request Body** (수정할 필드만)
```json
{ "title": "새 제목", "start_date": "2026-08-02", "end_date": "2026-08-04" }
```

**Response**: 수정된 일정 객체

---

### 일정 삭제
`DELETE /api/schedules/[id]`

**Response**: `{}` (status 204)

---

## 장바구니 (Cart)

### 장바구니 조회
`GET /api/cart`

> 로그인 세션 쿠키 필요 (미로그인 시 401)

**Response**
```json
{
  "items": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "place_id": "uuid",
      "created_at": "2026-07-23T...",
      "places": { ... }
    }
  ]
}
```

---

### 장바구니 추가
`POST /api/cart`

> 로그인 세션 쿠키 필요 (미로그인 시 401)

**Request Body**
```json
{ "place_id": "uuid" }
```

**Response**: 생성된 항목 (status 201)

---

### 장바구니 삭제
`DELETE /api/cart?id={uuid}`

**Response**: `{}` (status 204)

---

## 코스 (Courses)

### 코스 목록 조회
`GET /api/courses`

**Query Parameters**
| 파라미터 | 타입 | 설명 |
|---|---|---|
| `user_id` | string | 특정 사용자 코스만 조회 (없으면 전체 큐레이션 코스) |

**Response**
```json
{
  "items": [
    {
      "id": "uuid",
      "title": "신라 문화재 투어",
      "description": "...",
      "is_ai_generated": false,
      "course_places": [ ... ]
    }
  ]
}
```

---

### 코스 생성
`POST /api/courses`

**Request Body**
```json
{
  "title": "내 코스",
  "description": "설명",
  "user_id": "uuid",
  "place_ids": ["uuid1", "uuid2", "uuid3"]
}
```

**Response**: 생성된 코스 객체 (status 201)

---

## 리뷰 (Reviews)

### 리뷰 목록 조회
`GET /api/reviews?place_id={uuid}`

**Response**
```json
{
  "items": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "place_id": "uuid",
      "content": "좋았어요!",
      "rating": 5,
      "images": [],
      "created_at": "2026-07-23T..."
    }
  ]
}
```

---

### 리뷰 작성
`POST /api/reviews`

> 로그인 세션 쿠키 필요 (미로그인 시 401)

**Request Body**
```json
{
  "place_id": "uuid",
  "content": "좋았어요!",
  "rating": 5,
  "images": []
}
```

**Response**: 생성된 리뷰 객체 (status 201)

---

### 리뷰 삭제
`DELETE /api/reviews?id={uuid}`

**Response**: `{}` (status 204)

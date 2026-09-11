# 불국사 쇼츠 — 앱 등록 정보

완성 파일: `public/videos/bulguksa.mp4` → 앱에서의 주소는 **`/videos/bulguksa.mp4`**
대표 이미지: `public/videos/bulguksa-poster.jpg` → **`/videos/bulguksa-poster.jpg`**

**상태(2026-09-11): 운영 DB에 등록·게시 완료.** 불국사(TourAPI contentId `126166`)에 연결돼 있고,
아래 표는 다시 등록하거나 다른 환경에 옮길 때의 입력값이다.

## `/admin/shorts` 입력값

| 항목 | 값 |
|---|---|
| 연결 문화재 | 불국사 (TourAPI `contentId` = `126166`) |
| 제목 | 불국사, 천 년을 견딘 돌 |
| 소개 | 신라 재상 김대성이 세운 절은 임진왜란에 타 없어졌지만, 석축 기단과 두 탑은 자리를 지켰습니다. |
| 영상 주소 | `/videos/bulguksa.mp4` |
| 영상 언어 | 한국어 |
| 길이 | 60초 |
| 태그 | `문화재 소개`, `세계유산`, `불교문화` |
| 대표 이미지 | `/videos/bulguksa-poster.jpg` (영상 속 장면 한 컷) |
| 대본 | 선택 사항. 필요하면 [`bulguksa.srt`](bulguksa.srt) 내용을 넣는다 |

나레이션이 영상 안에 들어 있으므로 **별도 음성 파일은 등록하지 않는다.** 쇼츠 재생기는
음소거로 시작하고 사용자가 소리 버튼으로 켠다.

## 사양

- 1080×1920 세로(9:16), 60fps, 60.00초
- H.264 + AAC 48kHz 모노, 약 13MB
- 화면 안에 글자 없음 — 자막을 태우지 않았고 펜대의 제작자 문구도 지웠다

## 다른 환경에 등록할 때 확인할 것

1. **`contentId`.** TourAPI 기준 불국사는 `126166`이다. 예전 샘플 데이터의 `bulguksa` 같은
   문자 id는 앱이 걸러 내므로 연결 대상으로 쓰지 않는다.
2. **관리자 권한.** `/admin/shorts`는 `ADMIN_EMAILS`에 든 계정으로 로그인해야 들어갈 수 있다.
   (데모 계정은 관리자 권한을 받지 않는다.)

## 저장소 용량

`public/videos/bulguksa.mp4`(13MB)와 `bulguksa-poster.jpg`는 앱 배포에 포함돼야 하므로 커밋한다.
`scene-*-whiteboard.mp4`(각 4.4MB)는 중간 산출물이고 원본 PNG와 주석으로 언제든 다시 만들 수 있으니
커밋하지 않는 편이 낫다. `voice-samples/`도 음성을 InJoon으로 확정한 뒤에는 지워도 된다.

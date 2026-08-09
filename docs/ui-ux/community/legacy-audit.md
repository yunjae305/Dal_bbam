# 기존 FE-B 자료 확인 기록

커뮤니티 디자인 자료의 출처와 중복 여부를 확인하기 위해 로컬에 남아 있는 FE-B ZIP과 이미지 자료를 점검했다. 현재 저장소 비교 기준은 커밋 `e13734f8d7c31d0fc30d4a0daba320060f3b86ad`이다.

## 확인 결과

### 에셋 정리 ZIP

- `Dal_bbam-main-fe-b-assets-korean-names-20260712.zip`
- `Dal_bbam-main-fe-b-assets-organized-v2-20260712.zip`
- `FE-B-login-home-assets-organized-20260711*.zip`

커뮤니티 전용 화면 시안이나 UI/UX 문서는 없었다. 홈 카테고리용 커뮤니티 아이콘만 있었고, 해당 아이콘은 현재 저장소에 동일한 내용으로 이미 반영되어 있다.

### 구형 FE-B 구현 ZIP

- `gyeongju-fe-b.zip`
- `gyeongju-fe-b-final*.zip`
- `gyeongju-fe-b-final-v4.1-sprint1.zip`
- `gyeongju-fe-b-final-v4.2-sprint1*.zip`

다음 구형 코드가 들어 있었다.

- `components/community-feed.tsx`
- `app/community/page.tsx`
- 일부 버전의 `data/community.ts`

구형 구현은 후기 목록과 장소·별점 표시 중심이며, 기준 커밋 `e13734f8d7c31d0fc30d4a0daba320060f3b86ad`에 존재하는 카테고리 필터, 작성·수정·삭제, 북마크, 사진 업로드, AI 초안 기능보다 범위가 작다. 중복 코드와 기능 퇴행을 피하기 위해 저장소에 다시 복사하지 않는다.

### 기타 이미지

- `사진 합친 화면예제.png`: 별도 MyBatis 게시판 예제로 경주 관광 앱과 무관
- `달밤/files/화면.png`: 과거 홈 화면 시안으로 전체 앱 분위기 참고는 가능하지만 커뮤니티 전용 자료는 아님

## 적용 결정

1. 과거 ZIP과 구형 커뮤니티 코드는 다시 포함하지 않는다.
2. 현재 `main`의 커뮤니티 구현을 기능 정본으로 사용한다.
3. 이 폴더의 목록·작성·상세 AI 콘셉트 3장을 UI/UX 협의용 초안으로 사용한다.
4. 현진님 검토 후 수정된 시안과 화면 명세를 기준으로 FE 구현을 진행한다.
5. 디자인 원본이 추가로 발견되면 덮어쓰지 않고 `references/`에 출처와 날짜를 기록하여 보존한다.

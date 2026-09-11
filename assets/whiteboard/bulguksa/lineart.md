# 불국사 쇼츠 — 선화 제작

선화는 이미지 생성 모델이 아니라 **코드로 직접 그렸다.** 이 스킬이 요구하는 그림은
"극단적으로 단순한 개념 삽화"라서 도형과 곡선으로 충분히 표현되고, 무엇보다
**각 요소의 픽셀 좌표를 정확히 알 수 있다**는 이점이 크다. 주석(annotation)의 `region`을
눈으로 추정하지 않고 그린 값 그대로 쓸 수 있다.

## 파일

| 도구 | 역할 |
|---|---|
| [`_tools/sketch.py`](../_tools/sketch.py) | 손그림 느낌의 공용 드로잉 도구. 모든 선에 흔들림을 주고 두 번 겹쳐 그린다. 2배 캔버스에 그린 뒤 축소해 계단 현상을 없앤다. |
| [`_tools/draw_bulguksa_01.py`](../_tools/draw_bulguksa_01.py) | 장면 1 — 토함산 / 김대성 / 청운교·백운교 / 두 탑 |
| [`_tools/draw_bulguksa_02.py`](../_tools/draw_bulguksa_02.py) | 장면 2 — 두 탑의 대비 / 불길 / 남은 석축 / 다시 선 절 |

## 지킨 규범

스킬의 「통일 출도 시각 규범」을 그대로 따랐다.

- 배경 `#F5EBD7` 단색, 순백 없음
- 선은 짙은 회색 `#3A3A38` 하나. 강조는 빨강·주황·파랑만 아주 조금(해, 상륜부, 불길)
- 화면 안에 **글자·숫자·라벨 없음**
- 요소 4개를 세로로 나눠 **서로 겹치지 않게** 배치 — 덕분에 `protectedRegions`가 전부 비어 있다
- 1080×1920 세로(9:16), 앱 쇼츠 권장 비율

## 다시 그릴 때

```bash
ENV_PY="C:/Users/winz/.claude/skills/srt-whiteboard-animation/.venv/Scripts/python.exe"

PYTHONIOENCODING=utf-8 PYTHONUTF8=1 "$ENV_PY" assets/whiteboard/_tools/draw_bulguksa_01.py \
  assets/whiteboard/bulguksa/scene-01-bulguksa-founding.png
PYTHONIOENCODING=utf-8 PYTHONUTF8=1 "$ENV_PY" assets/whiteboard/_tools/draw_bulguksa_02.py \
  assets/whiteboard/bulguksa/scene-02-bulguksa-survival.png
```

`Sketch(W, H, seed=...)`의 seed를 바꾸면 손떨림 패턴이 달라진다. 좌표를 고치면
같은 이름의 `.annotation.json`의 `region`도 함께 맞춰야 한다.

## 다른 관광지로 확장할 때

`sketch.py`는 관광지와 무관한 공용 도구다. 새 관광지는 `draw_<이름>_01.py`를 하나 더 만들어
요소 4개를 세로로 배치하면 된다. 장면 2의 `seokga()`/`dabo()`처럼 반복되는 형태는
크기 계수 `k`를 받는 함수로 빼두면 여러 장면에서 재사용된다.

## 그리는 손 자산

스킬이 주는 `assets/drawing-hand.png`는 펜대에 제작자의 중국어 브랜드 문구가 인쇄돼 있다.
스킬 자체가 "사용자가 명시적으로 보존을 요청하지 않으면 화면에 글자가 없어야 한다"고 규정하고,
달밤은 관광 콘텐츠라 제3자 브랜드가 화면에 남아서는 안 된다.

[`_tools/clean_hand.py`](../_tools/clean_hand.py)가 그 문구를 지운다. 흰 펜대 위에 떠 있는
어두운 덩어리만 골라 덮는 방식이라 손과 펜의 윤곽선은 그대로 남는다. 결과물
[`_tools/drawing-hand.png`](../_tools/drawing-hand.png)를 렌더 인자로 넘긴다.

```bash
PYTHONIOENCODING=utf-8 PYTHONUTF8=1 "$ENV_PY" assets/whiteboard/_tools/clean_hand.py \
  "C:/Users/winz/.claude/skills/srt-whiteboard-animation/assets/drawing-hand.png" \
  assets/whiteboard/_tools/drawing-hand.png
```

렌더할 때 손 인자로 **반드시 이 파일**을 준다. 스킬 쪽 원본을 그대로 쓰면 브랜드 문구가 영상에 박힌다.

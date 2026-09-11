# 불국사 쇼츠 — 나레이션 대본과 음성

대본 원본은 [bulguksa.srt](bulguksa.srt)이고, 이 문서는 그것을 **어떻게 읽을지**를 정한다.
총 60초, 8문장, 문장마다 7.5초 슬롯.

## 음성 선택

키 없이 쓰는 Microsoft Edge 신경망 음성이다. 세 가지를 모두 만들어 두었으니 들어보고 고르면 된다.

| 파일 | 음성 | 성별 | 인상 | 실제 발화 |
|---|---|---|---|---|
| [voice-samples/injoon.m4a](voice-samples/injoon.m4a) | `ko-KR-InJoonNeural` | 남 | 차분하고 무게감 있음. 역사 서술에 맞음 | 44.3초 |
| [voice-samples/sunhi.m4a](voice-samples/sunhi.m4a) | `ko-KR-SunHiNeural` | 여 | 부드럽고 친근함. 관광 안내에 맞음 | 43.4초 |
| [voice-samples/hyunsu.m4a](voice-samples/hyunsu.m4a) | `ko-KR-HyunsuMultilingualNeural` | 남 | 밝고 가벼움. 다국어 확장 시 유리 | 43.8초 |

**기본값은 `injoon`**으로 잡았다. 천 년 된 절의 소실과 존속을 다루는 내용이라 차분한 남성 서술이 붙는다.
다만 앱 전체 톤이 여행 안내에 가까우므로 `sunhi`도 충분히 후보다. 최종 선택은 들어보고 정하면 된다.

다국어 확장 계획이 있다면 `hyunsu`가 유리하다. 같은 음성으로 영어·일본어·중국어를 읽을 수 있어
쇼츠 4개 언어판의 목소리가 통일된다.

## 문장별 전달 지시

발화 길이는 모두 슬롯(7.5초) 안에 들어간다. 남는 1~2.7초가 문장 사이 호흡이 되므로
억지로 늘이거나 줄이지 않는다.

| # | 시각 | 문장 | 전달 |
|---|---|---|---|
| 1 | 0.0–7.5s | 경주 토함산 자락에, 천 년을 서 있는 절이 있습니다. | 여는 문장. 쉼표에서 한 박 쉬고 "천 년"에 무게를 싣는다. |
| 2 | 7.5–15.0s | 신라 경덕왕 때 재상 김대성이 부모를 기리며 불국사를 세웠습니다. | 사실 전달. 평이하게. "부모를 기리며"만 살짝 눌러 준다. |
| 3 | 15.0–22.5s | 청운교와 백운교를 오르면, 부처의 나라로 들어섭니다. | 공간 진입. 쉼표 뒤를 조금 띄워 문턱을 넘는 느낌을 준다. |
| 4 | 22.5–30.0s | 마당에는 석가탑과 다보탑이 천 년째 마주 서 있습니다. | 1막의 도착점. "마주 서 있습니다"를 천천히 내린다. |
| 5 | 30.0–37.5s | 석가탑은 깎아낸 듯 단정하고, 다보탑은 화려하게 솟아오릅니다. | 대비 문장. 앞뒤 절의 결을 다르게. 앞은 절제, 뒤는 열어 준다. |
| 6 | 37.5–45.0s | 임진왜란의 불길에 목조 건물은 모두 타버렸습니다. | 전환점. 톤을 한 단계 낮춘다. "모두"에 힘. |
| 7 | 45.0–52.5s | 그러나 돌로 쌓은 기단과 두 탑은 끝내 자리를 지켰습니다. | 반전. "그러나"에서 한 박 쉬고 다시 올린다. |
| 8 | 52.5–60.0s | 1995년 세계유산이 된 불국사가, 지금도 당신을 기다립니다. | 맺음. "당신을"에서 청자 쪽으로 돌린다. 끝을 서두르지 않는다. |

## 오디오 사양

- 48kHz 모노 AAC(.m4a), 총 60.00초
- 각 문장을 개별 합성해 **자막 시작 시각에 그대로 배치**하고 나머지는 무음으로 채운다.
  따라서 오디오 타임라인이 SRT와 정확히 일치하고, 화이트보드 영상과 그대로 맞물린다.
- 최대 진폭 0.652 — 클리핑 없음. 별도 노멀라이즈가 필요 없다.

## 다시 만들 때

```bash
ENV_PY="C:/Users/winz/.claude/skills/srt-whiteboard-animation/.venv/Scripts/python.exe"

PYTHONIOENCODING=utf-8 PYTHONUTF8=1 "$ENV_PY" assets/whiteboard/_tools/narrate_srt.py \
  assets/whiteboard/bulguksa/bulguksa.srt \
  assets/whiteboard/bulguksa/narration.m4a \
  --voice ko-KR-InJoonNeural --total-sec 60
```

속도를 바꾸려면 `--rate -10%` 처럼 준다. 문장이 슬롯을 넘기면 스크립트가 `넘침`으로 표시한다.

렌더된 무음 장면들을 이어붙이고 이 오디오를 입히는 것은 다음 한 줄이다.

```bash
PYTHONIOENCODING=utf-8 PYTHONUTF8=1 "$ENV_PY" assets/whiteboard/_tools/mux_audio.py \
  --video assets/whiteboard/bulguksa/scene-01-bulguksa-founding-whiteboard.mp4 \
          assets/whiteboard/bulguksa/scene-02-bulguksa-survival-whiteboard.mp4 \
  --audio assets/whiteboard/bulguksa/narration.m4a \
  --out public/videos/bulguksa.mp4
```

스킬이 주는 `merge_scenes.py`는 쓰지 않는다. 입력마다 pts가 0부터 다시 시작하는 것을
보정하지 않아 PyAV 18에서 muxing이 실패한다. `mux_audio.py`가 이어붙이기와 오디오 입히기를
함께 처리한다.

## 앱 등록과의 관계

나레이션이 **영상 파일 안에** 들어가므로, `/admin/shorts`에는 MP4 주소 하나만 등록하면 된다.
별도 음성 파일(`audioUrl`) 등록은 필요 없다. 쇼츠 재생기는 처음에 음소거로 시작하고
사용자가 소리 버튼을 눌러 켜는 구조다([쇼츠 운영 안내](../../../docs/shorts-content-workflow.md)).

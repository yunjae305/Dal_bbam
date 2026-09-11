#!/usr/bin/env python3
"""
스킬이 제공하는 drawing-hand.png의 펜대에서 제작자 브랜드 문구를 지운다.

원본 펜대에는 스킬 제작자의 중국어 문구가 인쇄돼 있다. 스킬 자체가 "사용자가 명시적으로
보존을 요청하지 않는 한 화면에 글자가 없어야 한다"고 규정하고, 달밤은 관광 콘텐츠라
제3자 브랜드가 화면에 남아서는 안 된다.

판정 방법: 글자는 **흰 펜대 위에 떠 있는 어두운 덩어리**다. 어두운 연결 성분마다 그
테두리를 살펴 주위가 대부분 흰색이면 글자로 보고 흰색으로 덮는다. 손과 펜의 윤곽선은
주위가 살구색·갈색이므로 그대로 남는다.

사용법:
  <ENV_PY> clean_hand.py <원본.png> <출력.png>
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

DARK = 110          # 이보다 어두우면 선/글자 후보
BRIGHT = 200        # 이보다 밝으면 펜대 몸통
MIN_AREA = 40       # 이보다 작으면 잡티로 보고 무시
MAX_AREA = 20_000   # 이보다 크면 전체 윤곽선이므로 글자가 아니다
SURROUND = 0.60     # 테두리의 이 비율 이상이 흰색이어야 글자로 본다


def clean(src: Path, dst: Path) -> int:
    image = cv2.imread(str(src), cv2.IMREAD_UNCHANGED)
    if image is None:
        print(f"[err] 이미지를 읽지 못했습니다: {src}")
        return 1
    if image.shape[2] != 4:
        print("[err] 알파 채널이 있는 PNG가 필요합니다.")
        return 1

    bgr = image[:, :, :3]
    alpha = image[:, :, 3]
    opaque = alpha > 128

    dark = ((bgr < DARK).all(axis=2) & opaque).astype(np.uint8)
    bright = ((bgr > BRIGHT).all(axis=2) & opaque)

    count, labels, stats, _ = cv2.connectedComponentsWithStats(dark, connectivity=8)
    kernel = np.ones((7, 7), np.uint8)

    erased = np.zeros(dark.shape, dtype=bool)
    glyphs = 0
    for label in range(1, count):
        area = int(stats[label, cv2.CC_STAT_AREA])
        if area < MIN_AREA or area > MAX_AREA:
            continue
        piece = (labels == label).astype(np.uint8)
        ring = (cv2.dilate(piece, kernel, iterations=1) - piece).astype(bool)
        if not ring.any():
            continue
        if bright[ring].mean() < SURROUND:
            continue
        # 글자 본체와 그 테두리의 잔영까지 함께 덮는다.
        erased |= cv2.dilate(piece, np.ones((3, 3), np.uint8), iterations=1).astype(bool)
        glyphs += 1

    image[erased, 0:3] = 255
    image[erased, 3] = 255

    dst.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(dst), image)
    print(f"[ok] {dst}  (글자 덩어리 {glyphs}개 / 픽셀 {int(erased.sum()):,}개 덮음)")
    return 0


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    sys.exit(clean(Path(sys.argv[1]), Path(sys.argv[2])))


if __name__ == "__main__":
    main()

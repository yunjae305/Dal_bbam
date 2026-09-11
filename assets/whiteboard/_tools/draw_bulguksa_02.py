#!/usr/bin/env python3
"""장면 2 — 불국사의 소실과 존속. 두 탑의 대비 / 불길 / 남은 석축 / 다시 선 절."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sketch import ORANGE, RED, Sketch  # noqa: E402

W, H = 1080, 1920


def seokga(s: Sketch, cx: float, base_y: float, k: float = 1.0) -> None:
    """석가탑 — 깎아낸 듯 단정한 3층."""
    s.rect(cx - 84 * k, base_y, 168 * k, 24 * k, width=3.5)
    y = base_y
    for half, top in ((70, 56), (56, 112), (44, 164)):
        top_y = base_y - top * k
        s.line((cx - half * k, y), (cx - half * k, top_y + 16 * k), width=3)
        s.line((cx + half * k, y), (cx + half * k, top_y + 16 * k), width=3)
        s.curve([(cx - (half + 16) * k, top_y + 14 * k), (cx, top_y), (cx + (half + 16) * k, top_y + 14 * k)], width=3)
        y = top_y
    s.line((cx, base_y - 164 * k), (cx, base_y - 196 * k), width=3)
    s.ellipse(cx, base_y - 208 * k, 13 * k, 13 * k, width=3)


def dabo(s: Sketch, cx: float, base_y: float, k: float = 1.0) -> None:
    """다보탑 — 층마다 장식이 붙어 화려하게 솟는다."""
    s.rect(cx - 88 * k, base_y, 176 * k, 24 * k, width=3.5)
    for offset in (-70, -24, 24, 70):
        s.line((cx + offset * k, base_y), (cx + offset * k, base_y - 62 * k), width=3)
    s.line((cx - 92 * k, base_y - 64 * k), (cx + 92 * k, base_y - 64 * k), width=3.5)
    s.rect(cx - 60 * k, base_y - 126 * k, 120 * k, 60 * k, width=3)
    s.line((cx - 84 * k, base_y - 128 * k), (cx + 84 * k, base_y - 128 * k), width=3.5)
    s.polyline([(cx - 52 * k, base_y - 130 * k), (cx - 30 * k, base_y - 156 * k),
                (cx + 30 * k, base_y - 156 * k), (cx + 52 * k, base_y - 130 * k)], width=3)
    s.line((cx - 64 * k, base_y - 158 * k), (cx + 64 * k, base_y - 158 * k), width=3.5)
    s.polyline([(cx - 40 * k, base_y - 160 * k), (cx - 22 * k, base_y - 190 * k),
                (cx + 22 * k, base_y - 190 * k), (cx + 40 * k, base_y - 160 * k)], width=3)
    s.line((cx - 50 * k, base_y - 192 * k), (cx + 50 * k, base_y - 192 * k), width=3.5)
    s.line((cx, base_y - 192 * k), (cx, base_y - 232 * k), width=3)
    s.ellipse(cx, base_y - 244 * k, 15 * k, 15 * k, width=3)


def contrast(s: Sketch) -> None:
    """1. 단정한 석가탑과 화려한 다보탑의 대비. y 80-480"""
    seokga(s, 350, 470, k=0.92)
    dabo(s, 742, 470, k=0.92)


def burning(s: Sketch) -> None:
    """2. 불길에 휩싸인 목조 건물. y 560-1000"""
    left, right, floor = 330, 750, 990
    s.line((left - 26, floor), (right + 26, floor), width=3.5)          # 기단
    s.line((left - 14, floor), (left - 14, floor - 92), width=3)        # 기둥
    s.line((left + 118, floor), (left + 118, floor - 92), width=3)
    s.line((right - 118, floor), (right - 118, floor - 92), width=3)
    s.line((right + 14, floor), (right + 14, floor - 92), width=3)
    s.line((left - 40, floor - 94), (right + 40, floor - 94), width=3.5)
    s.curve([(left - 66, floor - 96), (540, floor - 168), (right + 66, floor - 96)], width=3.5)  # 지붕
    s.curve([(left - 20, floor - 128), (540, floor - 154), (right + 20, floor - 128)], width=2.5, wobble=1.0)
    # 지붕에서 솟는 불길 — 주황과 빨강 강조만 쓴다
    def roof_y(x: float) -> float:
        t = (x - 540) / 276
        return floor - 96 - 72 * (1 - min(1.0, t * t))

    def flame(base_x: float, height: float, spread: float, sway: float, color, width: float) -> None:
        root = roof_y(base_x)
        tip = root - height
        left, right_side = [], []
        for index in range(13):
            u = index / 12
            # 밑은 넓고 위로 갈수록 좁아지며 한쪽으로 휘는 불꽃 윤곽
            half = spread * (1 - u) ** 1.5
            wave = sway * u * (1 - u) * 4
            y = root - height * u
            left.append((base_x - half + wave, y))
            right_side.append((base_x + half + wave, y))
        s.accent(left + [(base_x + sway, tip)] + right_side[::-1], color, width=width, wobble=1.0)

    for base_x, height, spread, sway in ((432, 120, 30, 14), (540, 168, 38, -10), (648, 126, 32, 12)):
        flame(base_x, height, spread, sway, ORANGE, 3.0)
        flame(base_x, height * 0.52, spread * 0.42, sway * 0.5, RED, 2.5)


def survived(s: Sketch) -> None:
    """3. 목조는 사라지고 석축 기단과 두 탑만 남았다. y 1080-1480"""
    floor = 1470
    s.line((286, floor), (794, floor), width=3.5)
    s.line((286, floor), (286, floor - 34), width=3)
    s.line((794, floor), (794, floor - 34), width=3)
    s.line((286, floor - 34), (794, floor - 34), width=3.5)
    for x in range(330, 794, 58):                                        # 석축 줄눈
        s.line((x, floor - 34), (x, floor), width=2, wobble=1.0)
    # 기둥이 있던 자리 — 주춧돌만 남음
    for x in (330, 546, 762):
        s.ellipse(x, floor - 48, 20, 9, width=2.5)
    seokga(s, 420, floor - 60, k=0.56)
    dabo(s, 672, floor - 60, k=0.56)


def restored(s: Sketch) -> None:
    """4. 다시 선 불국사 전경. y 1560-1870"""
    floor = 1860
    s.line((150, floor), (930, floor), width=3.5)
    # 가운데 본채
    s.line((430, floor), (430, floor - 88), width=3)
    s.line((650, floor), (650, floor - 88), width=3)
    s.line((406, floor - 90), (674, floor - 90), width=3.5)
    s.curve([(378, floor - 92), (540, floor - 156), (702, floor - 92)], width=3.5)
    # 좌우 부속채
    s.line((222, floor), (222, floor - 62), width=3)
    s.line((374, floor), (374, floor - 62), width=3)
    s.line((204, floor - 64), (392, floor - 64), width=3.5)
    s.curve([(186, floor - 66), (298, floor - 110), (410, floor - 66)], width=3)
    s.line((706, floor), (706, floor - 62), width=3)
    s.line((858, floor), (858, floor - 62), width=3)
    s.line((688, floor - 64), (876, floor - 64), width=3.5)
    s.curve([(670, floor - 66), (782, floor - 110), (894, floor - 66)], width=3)
    # 마당의 두 탑 — 작게
    seokga(s, 492, floor - 4, k=0.3)
    dabo(s, 588, floor - 4, k=0.3)


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("scene-02-bulguksa-survival.png")
    s = Sketch(W, H, seed=23)
    contrast(s)
    burning(s)
    survived(s)
    restored(s)
    out.parent.mkdir(parents=True, exist_ok=True)
    s.save(str(out))


if __name__ == "__main__":
    main()

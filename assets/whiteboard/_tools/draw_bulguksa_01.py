#!/usr/bin/env python3
"""장면 1 — 불국사의 창건. 토함산 / 김대성 / 청운교·백운교 / 두 탑."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sketch import ORANGE, RED, Sketch  # noqa: E402

W, H = 1080, 1920


def mountain(s: Sketch) -> None:
    """1. 토함산 능선과 그 자락의 작은 절 지붕. y 80-500"""
    s.curve([(60, 400), (200, 300), (330, 200), (450, 150), (560, 205), (660, 300), (790, 380), (900, 430), (1020, 455)], width=4)
    s.curve([(150, 455), (300, 390), (430, 330), (540, 350), (650, 420), (800, 465)], width=2.5, wobble=1.0)
    # 자락에 앉은 절 지붕 하나
    roof = [(620, 470), (700, 424), (780, 470)]
    s.curve(roof, width=3.5)
    s.line((604, 472), (796, 472), width=3.5)
    s.line((640, 472), (640, 500), width=3)
    s.line((760, 472), (760, 500), width=3)
    # 능선 너머 해 — 개념적 강조
    s.accent(s.arc_points(470, 140, 34, 34, 0, 360), ORANGE, width=3)


def founder(s: Sketch) -> None:
    """2. 절을 세운 김대성. 뒷모습 실루엣. y 580-980"""
    cx = 540
    s.ellipse(cx, 640, 46, 50, width=3.5)          # 머리
    s.line((cx - 86, 596), (cx + 86, 596), width=3.5)               # 갓 챙
    s.curve([(cx - 86, 596), (cx, 586), (cx + 86, 596)], width=3)
    s.curve([(cx - 34, 592), (cx, 548), (cx + 34, 592)], width=3)   # 갓 모자
    s.line((cx, 690), (cx, 716), width=3)           # 목
    # 도포 — 어깨에서 아래로 퍼지는 곡선
    s.curve([(cx - 44, 720), (cx - 96, 810), (cx - 116, 950)], width=3.5)
    s.curve([(cx + 44, 720), (cx + 96, 810), (cx + 116, 950)], width=3.5)
    s.curve([(cx - 44, 720), (cx, 706), (cx + 44, 720)], width=3.5)
    s.line((cx - 116, 950), (cx + 116, 950), width=3.5)
    s.curve([(cx - 70, 800), (cx, 826), (cx + 70, 800)], width=2.5, wobble=1.0)  # 허리띠
    s.line((cx, 836), (cx, 950), width=2, wobble=1.0)


def stairs(s: Sketch) -> None:
    """3. 청운교와 백운교, 그 위의 문. y 1060-1480"""
    top, step_h, step_w = 1290, 26, 22
    # 아래 계단(백운교) 8단
    x, y = 360, 1460
    for index in range(8):
        s.line((x, y), (x + 96, y), width=3)
        s.line((x + 96, y), (x + 96, y - step_h), width=3)
        x += step_w
        y -= step_h
    # 위 계단(청운교) 6단
    x, y = 536, 1252
    for index in range(6):
        s.line((x, y), (x + 92, y), width=3)
        s.line((x + 92, y), (x + 92, y - step_h), width=3)
        x += step_w
        y -= step_h
    # 난간
    s.line((352, 1468), (700, 1090), width=2.5, wobble=1.2)
    # 계단 끝의 문 — 기둥 둘과 맞배지붕
    s.line((660, 1180), (660, 1092), width=3.5)
    s.line((792, 1180), (792, 1092), width=3.5)
    s.curve([(632, 1092), (726, 1058), (820, 1092)], width=3.5)
    s.line((620, 1094), (832, 1094), width=3.5)


def pagodas(s: Sketch) -> None:
    """4. 마주 선 석가탑과 다보탑. y 1560-1870"""
    # 석가탑 — 단정한 3층
    bx = 360
    s.rect(bx - 84, 1846, 168, 24, width=3.5)
    body = [(70, 1790, 46), (56, 1734, 42), (44, 1682, 38)]
    y = 1846
    for half, top, _ in body:
        s.line((bx - half, y), (bx - half, top + 16), width=3)
        s.line((bx + half, y), (bx + half, top + 16), width=3)
        s.line((bx - half - 16, top + 14), (bx + half + 16, top + 14), width=3.5)   # 지붕돌
        s.curve([(bx - half - 16, top + 14), (bx, top), (bx + half + 16, top + 14)], width=3)
        y = top
    s.line((bx, 1682), (bx, 1650), width=3)
    s.ellipse(bx, 1638, 13, 13, width=3)

    # 다보탑 — 화려하게 솟음
    dx = 730
    s.rect(dx - 88, 1846, 176, 24, width=3.5)
    s.line((dx - 70, 1846), (dx - 70, 1784), width=3)
    s.line((dx - 24, 1846), (dx - 24, 1784), width=3)
    s.line((dx + 24, 1846), (dx + 24, 1784), width=3)
    s.line((dx + 70, 1846), (dx + 70, 1784), width=3)
    s.line((dx - 92, 1782), (dx + 92, 1782), width=3.5)
    s.rect(dx - 60, 1720, 120, 60, width=3)
    s.line((dx - 84, 1718), (dx + 84, 1718), width=3.5)
    # 팔각 난간층
    s.polyline([(dx - 52, 1716), (dx - 30, 1690), (dx + 30, 1690), (dx + 52, 1716)], width=3)
    s.line((dx - 64, 1688), (dx + 64, 1688), width=3.5)
    s.polyline([(dx - 40, 1686), (dx - 22, 1656), (dx + 22, 1656), (dx + 40, 1686)], width=3)
    s.line((dx - 50, 1654), (dx + 50, 1654), width=3.5)
    s.polyline([(dx - 28, 1652), (dx - 16, 1626), (dx + 16, 1626), (dx + 28, 1652)], width=3)
    s.line((dx - 36, 1624), (dx + 36, 1624), width=3.5)
    s.line((dx, 1624), (dx, 1584), width=3)
    s.ellipse(dx, 1572, 15, 15, width=3)
    s.accent(s.arc_points(dx, 1572, 26, 26, 0, 360), RED, width=2.5)


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("scene-01-bulguksa-founding.png")
    s = Sketch(W, H, seed=11)
    mountain(s)
    founder(s)
    stairs(s)
    pagodas(s)
    out.parent.mkdir(parents=True, exist_ok=True)
    s.save(str(out))


if __name__ == "__main__":
    main()

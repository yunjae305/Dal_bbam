#!/usr/bin/env python3
"""
손그림 느낌의 선화를 그리기 위한 공용 도구.

화이트보드 애니메이션의 원화는 '극단적으로 단순한 개념 삽화'여야 한다.
자로 잰 듯한 선은 손그림으로 보이지 않으므로, 모든 선에 약간의 흔들림을 주고
같은 선을 두 번 겹쳐 그려 연필로 그은 느낌을 낸다.

캔버스는 2배 크기로 그린 뒤 축소해서 계단 현상을 없앤다(수퍼샘플링).
"""
from __future__ import annotations

import math
import random

from PIL import Image, ImageDraw

PAPER = (245, 235, 215)      # #F5EBD7 따뜻한 미색 종이
INK = (58, 58, 56)           # 짙은 회색 스케치 선
RED = (190, 72, 60)
ORANGE = (224, 138, 58)
BLUE = (74, 115, 160)

SUPERSAMPLE = 2


class Sketch:
    """수퍼샘플링 캔버스에 손그림 선을 그린다. 좌표는 최종 크기 기준."""

    def __init__(self, width: int, height: int, seed: int = 7) -> None:
        self.width = width
        self.height = height
        self.scale = SUPERSAMPLE
        self.image = Image.new("RGB", (width * self.scale, height * self.scale), PAPER)
        self.draw = ImageDraw.Draw(self.image)
        self.random = random.Random(seed)

    # ---------- 내부 도우미 ----------

    def _p(self, point: tuple[float, float]) -> tuple[float, float]:
        return (point[0] * self.scale, point[1] * self.scale)

    def _jitter(self, amount: float) -> float:
        return self.random.uniform(-amount, amount) * self.scale

    def _stroke(self, points: list[tuple[float, float]], width: float) -> None:
        scaled = [self._p(p) for p in points]
        self.draw.line(scaled, fill=INK, width=max(1, int(width * self.scale)), joint="curve")

    # ---------- 기본 획 ----------

    def line(self, start, end, width: float = 3.0, wobble: float = 1.6, passes: int = 2) -> None:
        """두 점을 잇는 흔들리는 선. 중간 점들을 흩어 손맛을 낸다."""
        length = math.dist(start, end)
        steps = max(2, int(length / 26))
        for _ in range(passes):
            points = []
            for index in range(steps + 1):
                t = index / steps
                x = start[0] + (end[0] - start[0]) * t
                y = start[1] + (end[1] - start[1]) * t
                if 0 < index < steps:
                    x += self._jitter(wobble) / self.scale
                    y += self._jitter(wobble) / self.scale
                points.append((x, y))
            self._stroke(points, width)

    def polyline(self, points, width: float = 3.0, wobble: float = 1.6, close: bool = False) -> None:
        sequence = list(points) + ([points[0]] if close else [])
        for index in range(len(sequence) - 1):
            self.line(sequence[index], sequence[index + 1], width, wobble)

    def rect(self, x, y, w, h, width: float = 3.0, wobble: float = 1.6) -> None:
        self.polyline([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], width, wobble, close=True)

    def arc_points(self, cx, cy, rx, ry, start_deg, end_deg, steps: int = 40):
        points = []
        for index in range(steps + 1):
            angle = math.radians(start_deg + (end_deg - start_deg) * index / steps)
            points.append((cx + rx * math.cos(angle), cy + ry * math.sin(angle)))
        return points

    def ellipse(self, cx, cy, rx, ry, width: float = 3.0, wobble: float = 1.4) -> None:
        self.polyline(self.arc_points(cx, cy, rx, ry, 0, 360), width, wobble)

    def curve(self, points, width: float = 3.0, wobble: float = 1.2, passes: int = 2) -> None:
        """점들을 부드럽게 잇는다(카트멀-롬 보간)."""
        if len(points) < 3:
            self.polyline(points, width, wobble)
            return
        padded = [points[0]] + list(points) + [points[-1]]
        smooth = []
        for index in range(len(padded) - 3):
            p0, p1, p2, p3 = padded[index:index + 4]
            for step in range(12):
                t = step / 12
                t2, t3 = t * t, t * t * t
                x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t
                           + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                           + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
                y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t
                           + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                           + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
                smooth.append((x, y))
        smooth.append(points[-1])
        for _ in range(passes):
            jittered = [
                (x + self._jitter(wobble) / self.scale, y + self._jitter(wobble) / self.scale)
                if 0 < i < len(smooth) - 1 else (x, y)
                for i, (x, y) in enumerate(smooth)
            ]
            self._stroke(jittered, width)

    def accent(self, points, color, width: float = 3.0, wobble: float = 1.4) -> None:
        """빨강·주황·파랑 강조선. 개념적 포인트로만 아주 조금 쓴다."""
        for _ in range(2):
            jittered = [
                (p[0] + self._jitter(wobble) / self.scale, p[1] + self._jitter(wobble) / self.scale)
                for p in points
            ]
            self.draw.line(
                [self._p(p) for p in jittered],
                fill=color,
                width=max(1, int(width * self.scale)),
                joint="curve",
            )

    def save(self, path: str) -> None:
        final = self.image.resize((self.width, self.height), Image.LANCZOS)
        final.save(path)
        print(f"[ok] {path}  ({self.width}x{self.height})")

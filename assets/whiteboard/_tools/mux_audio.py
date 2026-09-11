#!/usr/bin/env python3
"""
무음 장면 MP4들을 이어붙이고 나레이션 오디오를 입혀 최종 쇼츠를 만든다.

화이트보드 렌더러(render_stream_whiteboard.py)는 장면마다 소리 없는 MP4를 만든다.
이 스크립트가 그것들을 순서대로 이어 붙이고 오디오 트랙을 더한다.

스킬이 제공하는 merge_scenes.py는 쓰지 않는다. 그쪽은 입력마다 pts가 0부터 다시
시작하는 것을 보정하지 않아 PyAV 18에서 muxing이 실패한다.

비디오는 다시 인코딩한다. 패킷을 그대로 복사하는 편이 이론상 낫지만 PyAV 18에서
스트림 템플릿 복사와 pts 오프셋을 함께 쓰면 muxer가 time_base를 잃는다. 대신
crf 18로 인코딩해 눈으로 구분되지 않는 수준을 유지한다.

사용법:
  <ENV_PY> mux_audio.py --video 장면1.mp4 [장면2.mp4 ...] --audio 나레이션.m4a --out 최종.mp4
                        [--crf 18] [--fps 60]
"""
from __future__ import annotations

import argparse
import sys
from fractions import Fraction
from pathlib import Path

import av


def assemble(videos: list[Path], audio_path: Path, out_path: Path, crf: int, fps: int | None) -> int:
    for path in videos:
        if not path.exists():
            print(f"[err] 영상이 없습니다: {path}")
            return 1
    if not audio_path.exists():
        print(f"[err] 오디오가 없습니다: {audio_path}")
        return 1

    with av.open(str(videos[0])) as probe:
        first = probe.streams.video[0]
        width = first.codec_context.width
        height = first.codec_context.height
        rate = fps or int(round(float(first.average_rate)))

    out_path.parent.mkdir(parents=True, exist_ok=True)

    with av.open(str(out_path), mode="w") as out, av.open(str(audio_path)) as ain:
        # mp4 헤더는 첫 mux에서 확정된다. 그 전에 모든 스트림을 만들어 두어야 하며,
        # 나중에 추가하면 그 스트림의 time_base가 비어 muxing이 실패한다.
        vout = out.add_stream("h264", rate=rate)
        vout.width, vout.height = width, height
        vout.pix_fmt = "yuv420p"
        vout.options = {"crf": str(crf), "preset": "medium"}

        astream = ain.streams.audio[0]
        layout = astream.layout.name
        sample_rate = astream.codec_context.sample_rate
        aout = out.add_stream("aac", rate=sample_rate)
        aout.layout = layout

        index = 0
        for order, path in enumerate(videos, 1):
            with av.open(str(path)) as vin:
                stream = vin.streams.video[0]
                shape = (stream.codec_context.width, stream.codec_context.height)
                if shape != (width, height):
                    print(f"[err] 해상도가 다릅니다: {path} {shape} != {(width, height)}")
                    return 1
                for frame in vin.decode(stream):
                    # 장면마다 0부터 다시 시작하는 시각을 이어지는 번호로 새로 매긴다.
                    frame.pts = index
                    frame.time_base = Fraction(1, rate)
                    index += 1
                    for packet in vout.encode(frame):
                        out.mux(packet)
            print(f"  장면 {order}: {path.name}  누적 {index / rate:.2f}s")
        for packet in vout.encode(None):
            out.mux(packet)

        resampler = av.audio.resampler.AudioResampler(
            format="fltp", layout=layout, rate=sample_rate
        )
        position = 0
        for frame in ain.decode(astream):
            for resampled in resampler.resample(frame):
                resampled.pts = position
                resampled.time_base = Fraction(1, sample_rate)
                position += resampled.samples
                for packet in aout.encode(resampled):
                    out.mux(packet)
        for packet in aout.encode(None):
            out.mux(packet)
        print(f"  오디오: {audio_path.name}  {position / sample_rate:.2f}s")

    size_mb = out_path.stat().st_size / 1_048_576
    print(f"[ok] {out_path}  ({size_mb:.2f} MB, {width}x{height} {rate}fps, {index / rate:.2f}s)")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="장면 MP4 이어붙이고 나레이션 입히기")
    parser.add_argument("--video", nargs="+", required=True, help="무음 장면 MP4들(순서대로)")
    parser.add_argument("--audio", required=True, help="나레이션 오디오 경로")
    parser.add_argument("--out", required=True, help="출력 MP4 경로")
    parser.add_argument("--crf", type=int, default=18, help="화질(낮을수록 좋음, 기본 18)")
    parser.add_argument("--fps", type=int, default=None, help="출력 프레임률(기본: 입력과 동일)")
    args = parser.parse_args()
    sys.exit(assemble([Path(v) for v in args.video], Path(args.audio), Path(args.out), args.crf, args.fps))


if __name__ == "__main__":
    main()

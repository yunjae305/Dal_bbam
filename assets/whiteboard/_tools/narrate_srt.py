#!/usr/bin/env python3
"""
SRT 자막을 한국어 나레이션 오디오로 합성한다.

각 자막을 개별 합성한 뒤 자막의 시작 시각에 그대로 배치하고, 나머지 구간은
무음으로 채운다. 따라서 결과 오디오의 타임라인은 SRT와 정확히 일치하며
화이트보드 영상과 그대로 맞물린다.

Microsoft Edge의 신경망 음성을 쓴다. API 키가 필요 없고 네트워크만 있으면 된다.

사용법:
  <ENV_PY> narrate_srt.py <자막.srt> <출력.m4a> [--voice ko-KR-InJoonNeural]
                          [--rate +0%] [--pitch +0Hz] [--total-sec 60]

한국어 음성:
  ko-KR-InJoonNeural            남성, 차분하고 무게감 있음 (기본값)
  ko-KR-SunHiNeural             여성, 부드럽고 친근함
  ko-KR-HyunsuMultilingualNeural 남성, 밝고 다국어 가능
"""
from __future__ import annotations

import argparse
import asyncio
import io
import re
import sys
from pathlib import Path

import av
import edge_tts
import numpy as np

SAMPLE_RATE = 48_000
TIMECODE = re.compile(
    r"(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})"
)


def parse_srt(path: Path) -> list[dict]:
    """SRT를 [{startMs, endMs, text}] 로 읽는다."""
    cues: list[dict] = []
    block: list[str] = []

    def flush() -> None:
        if not block:
            return
        stamp = next((line for line in block if TIMECODE.search(line)), None)
        if not stamp:
            return
        g = [int(v) for v in TIMECODE.search(stamp).groups()]
        start = ((g[0] * 60 + g[1]) * 60 + g[2]) * 1000 + g[3]
        end = ((g[4] * 60 + g[5]) * 60 + g[6]) * 1000 + g[7]
        body = block[block.index(stamp) + 1:]
        text = " ".join(line.strip() for line in body if line.strip())
        if text:
            cues.append({"startMs": start, "endMs": end, "text": text})

    for raw in path.read_text(encoding="utf-8").splitlines():
        if raw.strip():
            block.append(raw)
        else:
            flush()
            block = []
    flush()
    return cues


async def synthesize(text: str, voice: str, rate: str, pitch: str) -> bytes:
    """한 줄을 합성해 MP3 바이트로 돌려준다."""
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    buffer = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buffer.write(chunk["data"])
    data = buffer.getvalue()
    if not data:
        raise RuntimeError(f"합성 결과가 비어 있습니다: {text[:30]}")
    return data


def decode_to_mono(mp3_bytes: bytes) -> np.ndarray:
    """MP3를 48kHz 모노 float32 파형으로 디코딩한다."""
    resampler = av.audio.resampler.AudioResampler(
        format="fltp", layout="mono", rate=SAMPLE_RATE
    )
    chunks: list[np.ndarray] = []
    with av.open(io.BytesIO(mp3_bytes)) as container:
        stream = container.streams.audio[0]
        for frame in container.decode(stream):
            for resampled in resampler.resample(frame):
                chunks.append(resampled.to_ndarray().reshape(-1).astype(np.float32))
        for resampled in resampler.resample(None):
            chunks.append(resampled.to_ndarray().reshape(-1).astype(np.float32))
    return np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)


def encode_m4a(samples: np.ndarray, out_path: Path) -> None:
    """float32 모노 파형을 AAC(.m4a)로 저장한다."""
    peak = float(np.max(np.abs(samples))) if samples.size else 0.0
    if peak > 1.0:
        samples = samples / peak

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with av.open(str(out_path), mode="w") as container:
        stream = container.add_stream("aac", rate=SAMPLE_RATE)
        stream.layout = "mono"

        frame_size = 1024
        position = 0
        while position < samples.size:
            block = samples[position:position + frame_size]
            if block.size < frame_size:
                block = np.pad(block, (0, frame_size - block.size))
            frame = av.AudioFrame.from_ndarray(
                block.reshape(1, -1), format="fltp", layout="mono"
            )
            frame.sample_rate = SAMPLE_RATE
            frame.pts = position
            for packet in stream.encode(frame):
                container.mux(packet)
            position += frame_size
        for packet in stream.encode(None):
            container.mux(packet)


async def build(args: argparse.Namespace) -> int:
    srt_path = Path(args.srt)
    cues = parse_srt(srt_path)
    if not cues:
        print(f"[err] 자막을 읽지 못했습니다: {srt_path}")
        return 1

    total_ms = int(args.total_sec * 1000) if args.total_sec else cues[-1]["endMs"]
    timeline = np.zeros(int(total_ms / 1000 * SAMPLE_RATE), dtype=np.float32)

    print(f"[..] 음성 {args.voice} / 속도 {args.rate} / 자막 {len(cues)}개")
    overruns = 0
    for index, cue in enumerate(cues, 1):
        mp3 = await synthesize(cue["text"], args.voice, args.rate, args.pitch)
        wave = decode_to_mono(mp3)
        spoken = wave.size / SAMPLE_RATE
        slot = (cue["endMs"] - cue["startMs"]) / 1000
        offset = int(cue["startMs"] / 1000 * SAMPLE_RATE)

        end = offset + wave.size
        if end > timeline.size:
            timeline = np.pad(timeline, (0, end - timeline.size))
        timeline[offset:end] += wave

        mark = "OK " if spoken <= slot else "넘침"
        if spoken > slot:
            overruns += 1
        print(f"  {index:>2} {mark} {spoken:5.2f}s / {slot:.2f}s  {cue['text'][:30]}")

    encode_m4a(timeline, Path(args.out))
    print(f"[ok] {args.out}  ({timeline.size / SAMPLE_RATE:.2f}s)")
    if overruns:
        print(f"[!] {overruns}개 자막이 슬롯을 넘깁니다. 문장을 줄이거나 --rate 를 올리세요.")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="SRT 자막을 한국어 나레이션 오디오로 합성")
    parser.add_argument("srt", help="입력 SRT 경로")
    parser.add_argument("out", help="출력 오디오 경로 (.m4a)")
    parser.add_argument("--voice", default="ko-KR-InJoonNeural", help="Edge 음성 이름")
    parser.add_argument("--rate", default="+0%", help="말하기 속도 (예: -10%%, +15%%)")
    parser.add_argument("--pitch", default="+0Hz", help="음높이 (예: -20Hz)")
    parser.add_argument("--total-sec", type=float, default=None, help="총 길이 고정(초)")
    sys.exit(asyncio.run(build(parser.parse_args())))


if __name__ == "__main__":
    main()

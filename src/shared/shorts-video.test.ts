import { describe, expect, it } from 'vitest';
import {
  normalizeMp4VideoUrl,
  normalizeYouTubeVideoId,
  resolveShortVideoSource
} from '@/shared/shorts-video';

const VIDEO_ID = 'dQw4w9WgXcQ';

describe('normalizeYouTubeVideoId', () => {
  it.each([
    VIDEO_ID,
    `https://www.youtube.com/watch?v=${VIDEO_ID}&t=10s`,
    `youtube.com/shorts/${VIDEO_ID}?feature=share`,
    `https://youtu.be/${VIDEO_ID}?si=abc`,
    `https://www.youtube.com/embed/${VIDEO_ID}`,
    `https://www.youtube-nocookie.com/embed/${VIDEO_ID}`,
    `https://m.youtube.com/live/${VIDEO_ID}`
  ])('normalizes %s', value => {
    expect(normalizeYouTubeVideoId(value)).toBe(VIDEO_ID);
  });

  it.each([
    '',
    'too-short',
    `https://youtube.example/watch?v=${VIDEO_ID}`,
    `https://youtube.com.evil.example/watch?v=${VIDEO_ID}`,
    'javascript:alert(1)'
  ])('rejects %s', value => {
    expect(normalizeYouTubeVideoId(value)).toBeNull();
  });
});

describe('MP4 and source normalization', () => {
  it('accepts remote, signed, and same-origin MP4 paths', () => {
    expect(normalizeMp4VideoUrl('https://cdn.example/short.MP4?token=abc')).toBe('https://cdn.example/short.MP4?token=abc');
    expect(normalizeMp4VideoUrl('/assets/shorts/night.mp4')).toBe('/assets/shorts/night.mp4');
  });

  it('rejects non-MP4 and unsafe URLs', () => {
    expect(normalizeMp4VideoUrl('https://cdn.example/short.webm')).toBeNull();
    expect(normalizeMp4VideoUrl('relative/short.mp4')).toBeNull();
    expect(normalizeMp4VideoUrl('javascript:alert(1).mp4')).toBeNull();
    expect(normalizeMp4VideoUrl('//attacker.example/short.mp4')).toBeNull();
  });

  it('turns a YouTube URL supplied as videoUrl into an ID', () => {
    expect(resolveShortVideoSource({ videoUrl: `https://youtu.be/${VIDEO_ID}` })).toEqual({
      kind: 'youtube',
      youtubeVideoId: VIDEO_ID
    });
  });

  it('prefers an explicitly supplied YouTube ID', () => {
    expect(resolveShortVideoSource({
      videoUrl: 'https://cdn.example/short.mp4',
      youtubeVideoId: VIDEO_ID
    })).toEqual({ kind: 'youtube', youtubeVideoId: VIDEO_ID });
  });
});

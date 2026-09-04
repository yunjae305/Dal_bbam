import { describe, expect, it } from 'vitest';
import { mapFallbackShort, mapShortRow } from '@/backend/shorts';

describe('short API mapping', () => {
  it('maps database video fields and the current actor reaction', () => {
    const item = mapShortRow({
      id: 'short-1',
      place_id: 'place-1',
      places: { content_id: 'tour-1' },
      title: '밤 산책',
      summary: '요약',
      narration: '내레이션',
      image_url: '/poster.jpg',
      audio_url: '/narration.mp3',
      video_url: 'https://cdn.example/night.mp4',
      youtube_video_id: null,
      duration_seconds: 58,
      narration_id: 'narration-1',
      tags: ['야경'],
      short_interactions: [
        { actor_key: 'me', liked: true, saved: false },
        { actor_key: 'other', liked: true, saved: true }
      ]
    }, 'me');

    expect(item).toMatchObject({
      contentId: 'tour-1',
      videoUrl: 'https://cdn.example/night.mp4',
      liked: true,
      saved: false,
      likeCount: 2,
      isAiGenerated: true
    });
  });

  it('keeps legacy image-only fallback clips compatible', () => {
    const item = mapFallbackShort({
      id: 'legacy',
      placeId: 'place',
      title: '레거시',
      caption: '이미지와 음성만 있는 기존 쇼츠',
      duration: '00:45',
      image: '/legacy.jpg',
      tags: []
    });

    expect(item.durationSeconds).toBe(45);
    expect(item.videoUrl).toBeUndefined();
    expect(item.youtubeVideoId).toBeUndefined();
  });
});

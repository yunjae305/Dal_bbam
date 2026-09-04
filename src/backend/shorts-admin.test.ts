import { describe, expect, it } from 'vitest';
import {
  adminRateLimitActor,
  adminShortInsertColumns,
  adminShortUpdateColumns,
  validateAdminShortCreate,
  validateAdminShortPatch
} from '@/backend/shorts-admin';

const SHORT_ID = '123e4567-e89b-42d3-a456-426614174000';
const YOUTUBE_ID = 'dQw4w9WgXcQ';

describe('admin short validation and write mapping', () => {
  it('normalizes a pasted YouTube URL before building insert columns', () => {
    const result = validateAdminShortCreate({
      contentId: 'tour-place-1',
      lang: 'ko',
      title: '동궁과 월지 야경',
      summary: '밤 산책 요약',
      narration: '밤 산책 내레이션',
      videoUrl: `https://www.youtube.com/shorts/${YOUTUBE_ID}?feature=share`,
      durationSeconds: 58,
      tags: ['야경', '야경', '신라'],
      isPublished: true
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      videoUrl: null,
      youtubeVideoId: YOUTUBE_ID,
      tags: ['야경', '신라']
    });
    expect(adminShortInsertColumns(result.value, 'place-uuid')).toMatchObject({
      place_id: 'place-uuid',
      video_url: null,
      youtube_video_id: YOUTUBE_ID,
      duration_seconds: 58,
      is_published: true
    });
  });

  it('allows a legacy image-only short but rejects an empty media payload', () => {
    const legacy = validateAdminShortCreate({
      contentId: 'tour-place-1',
      title: '기존 쇼츠',
      summary: '요약',
      narration: '내레이션',
      imageUrl: '/poster.jpg'
    });
    expect(legacy.ok).toBe(true);

    const empty = validateAdminShortCreate({
      contentId: 'tour-place-1',
      title: '빈 쇼츠',
      summary: '요약',
      narration: '내레이션',
      videoUrl: null
    });
    expect(empty.ok).toBe(false);
  });

  it('maps a PATCH null video source to both database columns', () => {
    const result = validateAdminShortPatch({ shortId: SHORT_ID, youtubeVideoId: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(adminShortUpdateColumns(result.value)).toMatchObject({
      video_url: null,
      youtube_video_id: null
    });
  });

  it('rejects ambiguous sources, unknown fields, and invalid duration', () => {
    expect(validateAdminShortPatch({
      shortId: SHORT_ID,
      videoUrl: '/short.mp4',
      youtubeVideoId: YOUTUBE_ID
    }).ok).toBe(false);
    expect(validateAdminShortPatch({ shortId: SHORT_ID, unexpected: true }).ok).toBe(false);
    expect(validateAdminShortPatch({ shortId: SHORT_ID, durationSeconds: 0 }).ok).toBe(false);
  });

  it('uses a stable, non-reversible rate-limit actor key', () => {
    const actor = adminRateLimitActor('203.0.113.10, 10.0.0.2', null);
    expect(actor).toBe(adminRateLimitActor('203.0.113.10', null));
    expect(actor).toMatch(/^admin:[a-f0-9]{32}$/);
    expect(actor).not.toContain('203.0.113.10');
  });
});

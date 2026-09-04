import { resolveShortVideoSource } from '@/shared/shorts-video';
import type { ShortClip, ShortItem } from '@/shared/types';

export const shortRowSelect = 'id, title, summary, narration, image_url, audio_url, video_url, youtube_video_id, duration_seconds, tags, place_id, narration_id, places(content_id), short_interactions(actor_key, liked, saved)';

type ShortRow = Record<string, unknown>;

function tagsFrom(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : [];
}

function contentIdFrom(row: ShortRow): string {
  const related = Array.isArray(row.places) ? row.places[0] : row.places;
  if (related && typeof related === 'object' && 'content_id' in related && related.content_id) {
    return String(related.content_id);
  }
  return String(row.place_id ?? '');
}

export function mapShortRow(row: ShortRow, actorKey?: string): ShortItem {
  const interactions = Array.isArray(row.short_interactions)
    ? row.short_interactions.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
  const mine = actorKey ? interactions.find(item => item.actor_key === actorKey) : undefined;
  const video = resolveShortVideoSource({
    videoUrl: row.video_url,
    youtubeVideoId: row.youtube_video_id
  });

  return {
    id: String(row.id),
    contentId: contentIdFrom(row),
    title: String(row.title ?? ''),
    summary: String(row.summary ?? ''),
    narration: String(row.narration ?? ''),
    imageUrl: String(row.image_url || '/login-spring-bg.png'),
    audioUrl: row.audio_url ? String(row.audio_url) : undefined,
    ...(video.kind === 'youtube' ? { youtubeVideoId: video.youtubeVideoId } : {}),
    ...(video.kind === 'mp4' ? { videoUrl: video.videoUrl } : {}),
    durationSeconds: Number(row.duration_seconds ?? 60),
    tags: tagsFrom(row.tags),
    liked: Boolean(mine?.liked),
    saved: Boolean(mine?.saved),
    likeCount: interactions.filter(item => item.liked === true).length,
    isAiGenerated: row.narration_id !== null
  };
}

function parseDuration(duration: string): number {
  const parts = duration.split(':').map(Number);
  if (parts.length !== 2 || parts.some(value => !Number.isFinite(value) || value < 0)) return 60;
  return Math.max(1, Math.round(parts[0] * 60 + parts[1]));
}

export function mapFallbackShort(clip: ShortClip): ShortItem {
  const video = resolveShortVideoSource(clip);
  return {
    id: clip.id,
    contentId: clip.placeId,
    title: clip.title,
    summary: clip.caption,
    narration: clip.caption,
    imageUrl: clip.image,
    ...(video.kind === 'youtube' ? { youtubeVideoId: video.youtubeVideoId } : {}),
    ...(video.kind === 'mp4' ? { videoUrl: video.videoUrl } : {}),
    durationSeconds: parseDuration(clip.duration),
    tags: clip.tags,
    liked: false,
    saved: false,
    likeCount: 0,
    isAiGenerated: false
  };
}

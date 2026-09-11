import { createHash } from 'node:crypto';
import { languages, type Lang } from '@/shared/types';
import { resolveShortVideoSource } from '@/shared/shorts-video';
import type { AdminShortItem } from '@/shared/admin-shorts';

export const adminShortRowSelect = 'id, title, summary, narration, image_url, audio_url, video_url, youtube_video_id, duration_seconds, tags, place_id, narration_id, places(content_id), lang, is_published, created_at, updated_at';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CREATE_KEYS = new Set([
  'contentId', 'lang', 'title', 'summary', 'narration', 'imageUrl', 'audioUrl',
  'videoUrl', 'youtubeVideoId', 'durationSeconds', 'tags', 'isPublished'
]);
const PATCH_KEYS = new Set([...CREATE_KEYS, 'shortId']);

type Validation<T> = { ok: true; value: T } | { ok: false; message: string };
type VideoColumns = { videoUrl: string | null; youtubeVideoId: string | null };

export type AdminShortCreate = {
  contentId: string;
  lang: Lang;
  title: string;
  summary: string;
  narration: string;
  imageUrl: string | null;
  audioUrl: string | null;
  durationSeconds: number;
  tags: string[];
  isPublished: boolean;
} & VideoColumns;

export type AdminShortPatch = {
  shortId: string;
  contentId?: string;
  lang?: Lang;
  title?: string;
  summary?: string;
  narration?: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  durationSeconds?: number;
  tags?: string[];
  isPublished?: boolean;
  video?: VideoColumns;
};

function invalid<T>(message: string): Validation<T> {
  return { ok: false, message };
}

function recordFrom(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

function assetUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > 2048 || candidate.startsWith('//')) return null;
  try {
    const relative = candidate.startsWith('/');
    const absolute = /^https?:\/\//i.test(candidate);
    if (!relative && !absolute) return null;
    const url = new URL(candidate, 'https://dal-bbam.invalid');
    if (!relative && url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!relative && (url.username || url.password)) return null;
    return candidate;
  } catch {
    return null;
  }
}

function parseTags(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 6) return null;
  const tags = value.map(tag => cleanText(tag, 30));
  if (tags.some(tag => tag === null)) return null;
  return Array.from(new Set(tags as string[]));
}

function parseVideo(body: Record<string, unknown>): Validation<VideoColumns | undefined> {
  const hasVideoUrl = Object.prototype.hasOwnProperty.call(body, 'videoUrl');
  const hasYouTubeId = Object.prototype.hasOwnProperty.call(body, 'youtubeVideoId');
  if (!hasVideoUrl && !hasYouTubeId) return { ok: true, value: undefined };

  const rawVideoUrl = body.videoUrl;
  const rawYouTubeId = body.youtubeVideoId;
  const nonEmptyInputs = [rawVideoUrl, rawYouTubeId]
    .filter(value => value !== null && value !== undefined && value !== '').length;
  if (nonEmptyInputs > 1) return invalid('videoUrl과 youtubeVideoId 중 하나만 입력해 주세요.');
  if (rawVideoUrl === null && (rawYouTubeId === null || rawYouTubeId === undefined)) {
    return { ok: true, value: { videoUrl: null, youtubeVideoId: null } };
  }
  if (rawYouTubeId === null && (rawVideoUrl === null || rawVideoUrl === undefined)) {
    return { ok: true, value: { videoUrl: null, youtubeVideoId: null } };
  }

  const source = resolveShortVideoSource({ videoUrl: rawVideoUrl, youtubeVideoId: rawYouTubeId });
  if (source.kind === 'none') {
    return invalid('유효한 YouTube ID/URL 또는 HTTP(S)·앱 내부 MP4 URL이 필요합니다.');
  }
  return source.kind === 'youtube'
    ? { ok: true, value: { videoUrl: null, youtubeVideoId: source.youtubeVideoId } }
    : { ok: true, value: { videoUrl: source.videoUrl, youtubeVideoId: null } };
}

function parseOptionalAsset(
  body: Record<string, unknown>,
  key: 'imageUrl' | 'audioUrl'
): Validation<string | null | undefined> {
  if (!Object.prototype.hasOwnProperty.call(body, key)) return { ok: true, value: undefined };
  if (body[key] === null) return { ok: true, value: null };
  const normalized = assetUrl(body[key]);
  return normalized ? { ok: true, value: normalized } : invalid(`${key}이(가) 유효한 URL이 아닙니다.`);
}

function hasOnlyKeys(body: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(body).every(key => allowed.has(key));
}

function parseLang(value: unknown): Lang | null {
  return typeof value === 'string' && languages.includes(value as Lang) ? value as Lang : null;
}

function parseDuration(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 600 ? Number(value) : null;
}

export function validateAdminShortMedia(value: {
  imageUrl: string | null;
  videoUrl: string | null;
  youtubeVideoId: string | null;
  narration: string;
}): Validation<true> {
  if (resolveShortVideoSource(value).kind !== 'none') return { ok: true, value: true };
  if (!value.imageUrl || !assetUrl(value.imageUrl)) return invalid('imageUrl 또는 영상 소스 중 하나는 필요합니다.');
  if (!value.narration.trim()) return invalid('이미지 쇼츠에는 내레이션 원고가 필요합니다.');
  return { ok: true, value: true };
}

export function validateAdminShortCreate(input: unknown): Validation<AdminShortCreate> {
  const body = recordFrom(input);
  if (!body || !hasOnlyKeys(body, CREATE_KEYS)) return invalid('허용되지 않은 필드가 있거나 JSON 객체가 아닙니다.');

  const contentId = cleanText(body.contentId, 200);
  const title = cleanText(body.title, 120);
  const summary = cleanText(body.summary, 600);
  const narration = body.narration === undefined ? '' : typeof body.narration === 'string' ? body.narration.trim() : null;
  const lang = body.lang === undefined ? 'ko' : parseLang(body.lang);
  if (!contentId || !title || !summary || !lang) {
    return invalid('contentId, title, summary와 지원 언어가 필요합니다.');
  }
  if (narration === null || narration.length > 6000) return invalid('narration은 최대 6000자의 문자열이어야 합니다.');

  const image = parseOptionalAsset(body, 'imageUrl');
  if (!image.ok) return image;
  const audio = parseOptionalAsset(body, 'audioUrl');
  if (!audio.ok) return audio;
  const video = parseVideo(body);
  if (!video.ok) return video;

  const durationSeconds = body.durationSeconds === undefined ? 60 : parseDuration(body.durationSeconds);
  const tags = body.tags === undefined ? [] : parseTags(body.tags);
  const isPublished = body.isPublished === undefined ? true : body.isPublished;
  if (durationSeconds === null || tags === null || typeof isPublished !== 'boolean') {
    return invalid('durationSeconds, tags 또는 isPublished 값이 유효하지 않습니다.');
  }
  const media = validateAdminShortMedia({
    imageUrl: image.value ?? null, videoUrl: video.value?.videoUrl ?? null,
    youtubeVideoId: video.value?.youtubeVideoId ?? null, narration
  });
  if (!media.ok) return media;

  return {
    ok: true,
    value: {
      contentId,
      lang,
      title,
      summary,
      narration,
      imageUrl: image.value ?? null,
      audioUrl: audio.value ?? null,
      videoUrl: video.value?.videoUrl ?? null,
      youtubeVideoId: video.value?.youtubeVideoId ?? null,
      durationSeconds,
      tags,
      isPublished
    }
  };
}

export function validateAdminShortPatch(input: unknown): Validation<AdminShortPatch> {
  const body = recordFrom(input);
  if (!body || !hasOnlyKeys(body, PATCH_KEYS)) return invalid('허용되지 않은 필드가 있거나 JSON 객체가 아닙니다.');
  if (typeof body.shortId !== 'string' || !UUID_PATTERN.test(body.shortId)) {
    return invalid('유효한 shortId가 필요합니다.');
  }
  if (Object.keys(body).length === 1) return invalid('수정할 필드가 필요합니다.');

  const patch: AdminShortPatch = { shortId: body.shortId };
  for (const [key, maxLength] of [
    ['contentId', 200], ['title', 120], ['summary', 600]
  ] as const) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      const text = cleanText(body[key], maxLength);
      if (!text) return invalid(`${key} 값이 유효하지 않습니다.`);
      patch[key] = text;
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'narration')) {
    if (typeof body.narration !== 'string' || body.narration.trim().length > 6000) return invalid('narration은 최대 6000자의 문자열이어야 합니다.');
    // Whether empty text is playable depends on the merged stored video source.
    patch.narration = body.narration.trim();
  }
  if (Object.prototype.hasOwnProperty.call(body, 'lang')) {
    const lang = parseLang(body.lang);
    if (!lang) return invalid('지원하지 않는 언어입니다.');
    patch.lang = lang;
  }
  const image = parseOptionalAsset(body, 'imageUrl');
  if (!image.ok) return image;
  if (image.value !== undefined) patch.imageUrl = image.value;
  const audio = parseOptionalAsset(body, 'audioUrl');
  if (!audio.ok) return audio;
  if (audio.value !== undefined) patch.audioUrl = audio.value;
  const video = parseVideo(body);
  if (!video.ok) return video;
  if (video.value) patch.video = video.value;

  if (Object.prototype.hasOwnProperty.call(body, 'durationSeconds')) {
    const duration = parseDuration(body.durationSeconds);
    if (duration === null) return invalid('durationSeconds는 1~600 사이의 정수여야 합니다.');
    patch.durationSeconds = duration;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'tags')) {
    const tags = parseTags(body.tags);
    if (!tags) return invalid('tags는 최대 6개의 짧은 문자열이어야 합니다.');
    patch.tags = tags;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'isPublished')) {
    if (typeof body.isPublished !== 'boolean') return invalid('isPublished는 boolean이어야 합니다.');
    patch.isPublished = body.isPublished;
  }

  return { ok: true, value: patch };
}

export function adminShortInsertColumns(value: AdminShortCreate, placeId: string) {
  return {
    place_id: placeId,
    lang: value.lang,
    title: value.title,
    summary: value.summary,
    narration: value.narration,
    image_url: value.imageUrl,
    audio_url: value.audioUrl,
    video_url: value.videoUrl,
    youtube_video_id: value.youtubeVideoId,
    duration_seconds: value.durationSeconds,
    tags: value.tags,
    is_published: value.isPublished,
    updated_at: new Date().toISOString()
  };
}

export function adminShortUpdateColumns(value: AdminShortPatch, placeId?: string) {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (placeId) update.place_id = placeId;
  if (value.lang !== undefined) update.lang = value.lang;
  if (value.title !== undefined) update.title = value.title;
  if (value.summary !== undefined) update.summary = value.summary;
  if (value.narration !== undefined) update.narration = value.narration;
  if (value.imageUrl !== undefined) update.image_url = value.imageUrl;
  if (value.audioUrl !== undefined) update.audio_url = value.audioUrl;
  if (value.video) {
    update.video_url = value.video.videoUrl;
    update.youtube_video_id = value.video.youtubeVideoId;
  }
  if (value.durationSeconds !== undefined) update.duration_seconds = value.durationSeconds;
  if (value.tags !== undefined) update.tags = value.tags;
  if (value.isPublished !== undefined) update.is_published = value.isPublished;
  return update;
}

export function adminRateLimitActor(forwardedFor: string | null, realIp: string | null): string {
  const source = (forwardedFor?.split(',')[0]?.trim() || realIp?.trim() || 'unknown').slice(0, 128);
  return `admin:${createHash('sha256').update(source).digest('hex').slice(0, 32)}`;
}

export function mapAdminShortRow(row: Record<string, unknown>): AdminShortItem {
  const place = Array.isArray(row.places) ? row.places[0] : row.places;
  const linked = recordFrom(place);
  const optionalText = (value: unknown) => typeof value === 'string' && value ? value : null;
  return {
    id: String(row.id), contentId: String(linked?.content_id ?? row.place_id ?? ''),
    lang: parseLang(row.lang) ?? 'ko', title: String(row.title ?? ''), summary: String(row.summary ?? ''),
    narration: String(row.narration ?? ''), imageUrl: optionalText(row.image_url),
    audioUrl: optionalText(row.audio_url), videoUrl: optionalText(row.video_url),
    youtubeVideoId: optionalText(row.youtube_video_id), durationSeconds: Number(row.duration_seconds ?? 60),
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    isPublished: row.is_published === true, isAiGenerated: Boolean(row.narration_id),
    createdAt: String(row.created_at ?? ''), updatedAt: String(row.updated_at ?? '')
  };
}

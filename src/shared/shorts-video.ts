const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com'
]);

export type ShortVideoSource =
  | { kind: 'youtube'; youtubeVideoId: string }
  | { kind: 'mp4'; videoUrl: string }
  | { kind: 'none' };

function trimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function validYouTubeId(value: string | null | undefined): string | null {
  return value && YOUTUBE_ID_PATTERN.test(value) ? value : null;
}

/**
 * Accepts a bare YouTube video ID and the URL shapes users commonly paste from
 * YouTube, including Shorts and privacy-enhanced embeds.
 */
export function normalizeYouTubeVideoId(value: unknown): string | null {
  const candidate = trimmedString(value);
  if (!candidate) return null;

  const bareId = validYouTubeId(candidate);
  if (bareId) return bareId;

  const urlInput = /^(?:youtu\.be|(?:www\.|m\.|music\.)?youtube\.com|(?:www\.)?youtube-nocookie\.com)(?:\/|$)/i.test(candidate)
    ? `https://${candidate}`
    : candidate;

  try {
    const url = new URL(urlInput);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    const path = url.pathname.split('/').filter(Boolean);

    if (hostname === 'youtu.be') {
      return validYouTubeId(path[0]);
    }
    if (!YOUTUBE_HOSTS.has(hostname)) return null;

    if (url.pathname === '/watch' || url.pathname === '/watch/') {
      return validYouTubeId(url.searchParams.get('v'));
    }

    const route = path[0]?.toLowerCase();
    if (route === 'shorts' || route === 'embed' || route === 'live') {
      return validYouTubeId(path[1]);
    }
  } catch {
    return null;
  }

  return null;
}

/** Only persistent HTTP(S) URLs and same-origin paths ending in .mp4 qualify. */
export function normalizeMp4VideoUrl(value: unknown): string | null {
  const candidate = trimmedString(value);
  if (!candidate || candidate.length > 2048 || candidate.startsWith('//')) return null;

  try {
    const relative = candidate.startsWith('/');
    const absolute = /^https?:\/\//i.test(candidate);
    if (!relative && !absolute) return null;
    const url = new URL(candidate, 'https://dal-bbam.invalid');
    if (!relative && url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!relative && (url.username || url.password)) return null;
    if (!/\.mp4$/i.test(url.pathname)) return null;
    return candidate;
  } catch {
    return null;
  }
}

/** YouTube URLs pasted into videoUrl are normalized into a YouTube ID. */
export function resolveShortVideoSource(input: {
  videoUrl?: unknown;
  youtubeVideoId?: unknown;
}): ShortVideoSource {
  const explicitYouTubeId = normalizeYouTubeVideoId(input.youtubeVideoId);
  if (explicitYouTubeId) return { kind: 'youtube', youtubeVideoId: explicitYouTubeId };

  const youtubeIdFromUrl = normalizeYouTubeVideoId(input.videoUrl);
  if (youtubeIdFromUrl) return { kind: 'youtube', youtubeVideoId: youtubeIdFromUrl };

  const videoUrl = normalizeMp4VideoUrl(input.videoUrl);
  if (videoUrl) return { kind: 'mp4', videoUrl };

  return { kind: 'none' };
}

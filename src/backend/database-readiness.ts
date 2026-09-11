// Kept free of framework imports so the runtime and read-only release CLI use
// the same checks. This module never invokes a mutating RPC or writes an object.
export const requiredDatabaseColumns: Record<string, string[]> = {
  places: ['id', 'content_id', 'name', 'overview', 'lat', 'lng'],
  place_translations: ['place_id', 'lang', 'name', 'overview'],
  ai_narrations: ['place_id', 'lang', 'source_hash', 'prompt_version', 'audio_path'],
  shorts: ['id', 'place_id', 'lang', 'title', 'summary', 'narration', 'image_url', 'audio_url', 'video_url', 'youtube_video_id', 'narration_id', 'is_published'],
  short_interactions: ['actor_key', 'short_id', 'liked', 'saved'],
  courses: ['id', 'user_id', 'actor_key', 'is_curated', 'share_token', 'metadata'],
  course_places: ['course_id', 'place_id', 'order_no', 'order_index', 'stay_minutes'],
  schedules: ['id', 'user_id', 'actor_key', 'share_token', 'start_date', 'end_date'],
  schedule_places: ['schedule_id', 'place_id', 'start_time', 'stay_minutes', 'sort_order', 'note'],
  cart_items: ['id', 'user_id', 'actor_key', 'place_id'],
  stamps: ['user_id', 'actor_key', 'lat', 'lng', 'stamp_target_id', 'checkpoint_id', 'checkpoint_verified_at', 'accuracy_m', 'distance_m'],
  badge_definitions: ['id'], user_badges: ['actor_key'],
  stamp_targets: ['id', 'place_id', 'is_active'], stamp_artworks: ['id', 'status'],
  stamp_checkpoint_tokens: ['id'], stamp_reward_definitions: ['id'], user_stamp_rewards: ['actor_key'],
  community_posts: ['id', 'actor_key', 'status'],
  community_media: ['expires_at', 'public_storage_path', 'processed_sha256', 'width', 'height', 'deleted_at'],
  community_bookmarks: ['actor_key'], community_comments: ['id'], community_reports: ['id'],
  user_blocks: ['actor_key', 'blocked_actor_key'],
  app_sessions: ['id', 'expires_at', 'revoked_at'], auth_actor_identities: ['auth_user_id', 'actor_key'],
  location_consents: ['actor_key'], place_events: ['event_date'], api_rate_limits: ['actor_key'], social_users: ['id']
};
export const requiredDatabaseFunctions = [
  'replace_schedule_places', 'consume_api_rate_limit', 'consume_stamp_checkpoint', 'claim_stamp',
  'approve_stamp_artwork', 'create_community_post', 'delete_actor_data', 'cleanup_expired_runtime_data',
  'get_place_view_ranking', 'update_schedule_with_places', 'create_schedule_with_places', 'save_curated_course'
];
const nullableColumns: Record<string, string[]> = {
  courses: ['user_id'], schedules: ['user_id'], cart_items: ['user_id'], stamps: ['user_id', 'lat', 'lng']
};
const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
export function requiredStorageBuckets(options: { aiEnabled: boolean; communityEnabled: boolean }) {
  return [
    { id: 'stamp-artworks-staging', public: false, types: imageTypes },
    { id: 'stamp-artworks', public: true, types: imageTypes },
    ...(options.communityEnabled ? [
      { id: 'community-staging', public: false, types: imageTypes },
      { id: 'community-public', public: true, types: imageTypes }
    ] : []),
    ...(options.aiEnabled ? [{ id: 'narration-audio', public: true, types: ['audio/mpeg'] }] : [])
  ];
}

type Metadata = {
  definitions?: Record<string, { properties?: Record<string, unknown>; required?: string[] }>;
  paths?: Record<string, { get?: unknown; post?: unknown }>;
};
type Probe<T> = { value: T | null; status: number | null; error: string | null };
export type DatabaseReadinessReport = {
  reachable: boolean; ready: boolean; schemaReady: boolean; storageReady: boolean; contentReady: boolean;
  schema: {
    metadataHttpStatus: number | null; metadataError: string | null; missingTables: string[];
    missingColumns: Record<string, string[]>; missingFunctions: string[]; incompatibleNotNull: string[];
    rankingReady: boolean; rankingError: string | null;
  };
  storage: { buckets: Record<string, { ready: boolean; error: string | null }> };
  content: { places: number | null; activeStampTargets: number | null; publishedVideos: number | null; videoSourceRowsChecked: number | null; errors: Record<string, string> };
  verification: string;
};

export type DatabaseReadinessOptions = {
  url: string; secret: string; aiEnabled: boolean; communityEnabled: boolean;
  fetcher?: typeof fetch; timeoutMs?: number;
};

function safeCode(error: unknown) {
  const object = error as { code?: unknown; cause?: { code?: unknown }; name?: unknown };
  const value = [object?.code, object?.cause?.code, object?.name]
    .find(candidate => typeof candidate === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(candidate));
  return typeof value === 'string' ? value : 'REQUEST_FAILED';
}

function validVideoReference(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const row = value as { video_url?: unknown; youtube_video_id?: unknown };
  if (typeof row.youtube_video_id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(row.youtube_video_id)) return true;
  if (typeof row.video_url !== 'string' || row.video_url.length > 2048 || !row.video_url.trim()) return false;
  const video = row.video_url.trim();
  if (video.startsWith('//') || (!video.startsWith('/') && !/^https:\/\//i.test(video))) return false;
  try {
    const url = new URL(video, 'https://dal-bbam.invalid');
    return !url.username && !url.password && /\.mp4$/i.test(url.pathname) &&
      (video.startsWith('/') ? url.origin === 'https://dal-bbam.invalid' : url.protocol === 'https:');
  } catch { return false; }
}

export async function inspectDatabaseReadiness(options: DatabaseReadinessOptions): Promise<DatabaseReadinessReport> {
  const fetcher = options.fetcher ?? fetch;
  // All requests share one deadline; a slow storage/metadata call cannot extend
  // the check by another timeout for each table or bucket.
  const signal = AbortSignal.timeout(Math.max(100, Math.min(10000, options.timeoutMs ?? 8000)));
  const base = options.url.replace(/\/$/, '');
  const headers = { apikey: options.secret, Authorization: `Bearer ${options.secret}` };
  async function probe<T>(path: string, params: Record<string, string>, count = false): Promise<Probe<T>> {
    let status: number | null = null;
    try {
      const url = new URL(`${base}${path}`);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
      const response = await fetcher(url, {
        method: count ? 'HEAD' : 'GET',
        headers: { ...headers, Accept: path === '/rest/v1/' ? 'application/openapi+json' : 'application/json', ...(count ? { Prefer: 'count=exact' } : {}) },
        cache: 'no-store', signal
      });
      status = response.status;
      if (!response.ok) return { value: null, status, error: `HTTP_${status}` };
      if (count) {
        const match = response.headers.get('content-range')?.match(/\/(\d+)$/);
        const total = match ? Number(match[1]) : NaN;
        if (!Number.isSafeInteger(total) || total < 0) return { value: null, status, error: 'COUNT_UNVERIFIED' };
        return { value: total as T, status, error: null };
      }
      return { value: await response.json() as T, status, error: null };
    } catch (error) { return { value: null, status, error: safeCode(error) }; }
  }

  const buckets = requiredStorageBuckets(options);
  const [metadataProbe, places, targets, videos, ranking, ...storageResults] = await Promise.all([
    probe<Metadata>('/rest/v1/', {}),
    probe<number>('/rest/v1/places', { select: 'id' }, true),
    probe<number>('/rest/v1/stamp_targets', {
      select: 'id,places!inner(id)', is_active: 'eq.true',
      'places.and': '(lat.gte.35.65,lat.lte.36.12,lng.gte.128.95,lng.lte.129.58)'
    }, true),
    probe<unknown[]>('/rest/v1/shorts', {
      select: 'video_url,youtube_video_id,places!inner(id)', is_published: 'eq.true',
      or: '(video_url.not.is.null,youtube_video_id.not.is.null)', limit: '100', order: 'updated_at.desc,id.desc'
    }),
    // This one RPC is STABLE and read-only. No write RPC is invoked to probe it.
    probe<unknown[]>('/rest/v1/rpc/get_place_view_ranking', { since_date: new Date().toISOString().slice(0, 10), limit: '1' }),
    ...buckets.map(bucket => probe<Record<string, unknown>>(`/storage/v1/bucket/${bucket.id}`, {}))
  ]);
  const metadata = metadataProbe.value as Metadata | null;
  const missingTables: string[] = [];
  const missingColumns: Record<string, string[]> = {};
  for (const [table, columns] of Object.entries(requiredDatabaseColumns)) {
    const definition = metadata?.definitions?.[table];
    if (!definition || !metadata?.paths?.[`/${table}`]?.get) { missingTables.push(table); continue; }
    const missing = columns.filter(column => !Object.hasOwn(definition.properties ?? {}, column));
    if (missing.length) missingColumns[table] = missing;
  }
  const missingFunctions = requiredDatabaseFunctions.filter(name => !metadata?.paths?.[`/rpc/${name}`]?.post);
  const incompatibleNotNull = Object.entries(nullableColumns).flatMap(([table, columns]) =>
    columns.filter(column => metadata?.definitions?.[table]?.required?.includes(column)).map(column => `${table}.${column}`));
  const rankingReady = !ranking.error && Array.isArray(ranking.value);
  const schemaReady = !metadataProbe.error && Boolean(metadata?.definitions && metadata?.paths) &&
    missingTables.length === 0 && Object.keys(missingColumns).length === 0 && missingFunctions.length === 0 && incompatibleNotNull.length === 0 && rankingReady;
  const storage: DatabaseReadinessReport['storage'] = { buckets: {} };
  buckets.forEach((expected, index) => {
    const result = storageResults[index];
    const bucket = result.value as Record<string, unknown> | null;
    const types = Array.isArray(bucket?.allowed_mime_types) ? bucket.allowed_mime_types : [];
    const ready = !result.error && bucket?.id === expected.id && bucket?.public === expected.public &&
      Number(bucket?.file_size_limit) === 10485760 && types.length === expected.types.length && expected.types.every(type => types.includes(type));
    storage.buckets[expected.id] = { ready, error: ready ? null : result.error ?? 'BUCKET_CONFIGURATION_MISMATCH' };
  });
  const content = {
    places: places.value as number | null,
    activeStampTargets: targets.value as number | null,
    publishedVideos: Array.isArray(videos.value) ? videos.value.filter(validVideoReference).length : null,
    videoSourceRowsChecked: Array.isArray(videos.value) ? videos.value.length : null,
    errors: {} as Record<string, string>
  };
  for (const [name, result] of [['places', places], ['activeStampTargets', targets]] as const) {
    if (result.error) content.errors[name] = result.error;
    else if (result.value === 0) content.errors[name] = 'CONTENT_EMPTY';
  }
  if (videos.error) content.errors.publishedVideos = videos.error;
  else if (!Array.isArray(videos.value)) content.errors.publishedVideos = 'VIDEO_SOURCES_UNVERIFIED';
  else if (content.publishedVideos === 0) content.errors.publishedVideos = 'NO_VALID_VIDEO_SOURCE_IN_SAMPLE';
  const contentReady = Object.keys(content.errors).length === 0 &&
    [content.places, content.activeStampTargets, content.publishedVideos].every(count => typeof count === 'number' && count > 0);
  const storageReady = Object.values(storage.buckets).every(bucket => bucket.ready);
  return {
    reachable: metadataProbe.status === 200 || typeof places.value === 'number',
    ready: schemaReady && storageReady && contentReady, schemaReady, storageReady, contentReady,
    schema: {
      metadataHttpStatus: metadataProbe.status, metadataError: metadataProbe.error,
      missingTables, missingColumns, missingFunctions, incompatibleNotNull,
      rankingReady, rankingError: rankingReady ? null : ranking.error ?? 'RPC_RESPONSE_UNVERIFIED'
    }, storage, content,
    verification: 'Read-only service-role schema/RPC metadata, stable ranking RPC, bucket configuration, and catalogue counts. publishedVideos counts valid local/HTTPS MP4 or YouTube references among at most 100 published rows. Does not verify Auth/RLS enforcement, write RPC behavior, media-file existence/playback, or AI pre-generation completion.'
  };
}

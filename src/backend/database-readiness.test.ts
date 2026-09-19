import { describe, expect, it, vi } from 'vitest';
import { inspectDatabaseReadiness, requiredDatabaseColumns, requiredDatabaseFunctions, requiredStorageBuckets } from './database-readiness';

const config = { url: 'https://database.example', secret: 'private-service-key', aiEnabled: false, communityEnabled: true };
function metadata() {
  return {
    definitions: Object.fromEntries(Object.entries(requiredDatabaseColumns).map(([table, columns]) => [table, { properties: Object.fromEntries(columns.map(column => [column, {}])), required: [] as string[] }])),
    paths: Object.fromEntries([
      ...Object.keys(requiredDatabaseColumns).map(table => [`/${table}`, { get: {} }]),
      ...requiredDatabaseFunctions.map(name => [`/rpc/${name}`, { post: {} }])
    ]) as Record<string, unknown>
  };
}
function fixture(options: { schema?: ReturnType<typeof metadata>; overrides?: Record<string, Response | Error>; aiEnabled?: boolean } = {}) {
  const schema = options.schema ?? metadata();
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const override = options.overrides?.[url.pathname];
    if (override instanceof Error) throw override;
    if (override) return override.clone();
    if (url.pathname === '/rest/v1/') return Response.json(schema);
    if (url.pathname === '/rest/v1/rpc/get_place_view_ranking') return Response.json([]);
    if (url.pathname === '/rest/v1/shorts') return Response.json([{ video_url: '/videos/heritage.mp4', youtube_video_id: null }]);
    const bucket = requiredStorageBuckets({ ...config, aiEnabled: options.aiEnabled ?? false }).find(item => url.pathname === `/storage/v1/bucket/${item.id}`);
    if (bucket) return Response.json({ id: bucket.id, public: bucket.public, file_size_limit: 10485760, allowed_mime_types: bucket.types });
    if (init?.method === 'HEAD') return new Response(null, { headers: { 'content-range': '*/3' } });
    throw new Error('Unexpected request');
  });
  return fetcher;
}

describe('read-only launch database readiness', () => {
  it('requires complete schema, configured buckets, and launch content without executing write RPCs', async () => {
    const fetcher = fixture();
    const result = await inspectDatabaseReadiness({ ...config, fetcher });
    expect(result).toMatchObject({ reachable: true, ready: true, schemaReady: true, storageReady: true, contentReady: true });
    expect(fetcher.mock.calls.every(([, init]) => ['HEAD', 'GET'].includes(String(init?.method)))).toBe(true);
    const calls = fetcher.mock.calls.map(([url]) => new URL(String(url)));
    expect(calls.filter(url => url.pathname.includes('/rpc/')).map(url => url.pathname)).toEqual(['/rest/v1/rpc/get_place_view_ranking']);
    expect(calls.find(url => url.pathname.endsWith('/stamp_targets'))?.searchParams.get('places.and')).toContain('lat.gte.35.65');
    expect(calls.find(url => url.pathname.endsWith('/shorts'))?.searchParams.get('or')).toContain('video_url.not.is.null');
    expect(calls.some(url => url.pathname.includes('narration-audio'))).toBe(false);
    expect(JSON.stringify(result)).not.toContain(config.secret);
    expect(JSON.stringify(result)).not.toContain(config.url);
  });

  it('rejects missing schema columns, functions, and legacy NOT NULL constraints even when catalogue reads succeed', async () => {
    const schema = metadata();
    delete schema.definitions.community_media.properties.expires_at;
    delete schema.paths['/rpc/create_schedule_with_places'];
    schema.definitions.cart_items.required.push('user_id');
    const result = await inspectDatabaseReadiness({ ...config, fetcher: fixture({ schema }) });
    expect(result.reachable).toBe(true);
    expect(result.ready).toBe(false);
    expect(result.schema).toMatchObject({ missingColumns: { community_media: ['expires_at'] }, missingFunctions: ['create_schedule_with_places'], incompatibleNotNull: ['cart_items.user_id'] });
  });

  it('fails closed when schema metadata is unverified despite successful content reads', async () => {
    const result = await inspectDatabaseReadiness({ ...config, fetcher: fixture({ overrides: { '/rest/v1/': new Response(null, { status: 503 }) } }) });
    expect(result).toMatchObject({ reachable: true, ready: false, schemaReady: false, contentReady: true });
    expect(result.schema.metadataError).toBe('HTTP_503');
  });

  it('treats ranking execution failure as a readiness failure even if its RPC is listed', async () => {
    const result = await inspectDatabaseReadiness({ ...config, fetcher: fixture({ overrides: { '/rest/v1/rpc/get_place_view_ranking': new Response(null, { status: 403 }) } }) });
    expect(result.ready).toBe(false);
    expect(result.schema).toMatchObject({ missingFunctions: [], rankingReady: false, rankingError: 'HTTP_403' });
  });

  it.each([
    { public: true, file_size_limit: 10485760, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] },
    { public: false, file_size_limit: null, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] },
    { public: false, file_size_limit: 10485760, allowed_mime_types: null }
  ])('rejects an incompatible private bucket configuration (%j)', async settings => {
    const result = await inspectDatabaseReadiness({ ...config, fetcher: fixture({ overrides: {
      '/storage/v1/bucket/community-staging': Response.json({ id: 'community-staging', ...settings })
    } }) });
    expect(result).toMatchObject({ ready: false, storageReady: false });
    expect(result.storage.buckets['community-staging'].error).toBe('BUCKET_CONFIGURATION_MISMATCH');
  });

  it('checks narration storage only when AI is enabled and fails on a missing artwork bucket', async () => {
    const fetcher = fixture({ aiEnabled: true, overrides: { '/storage/v1/bucket/stamp-artworks': new Response(null, { status: 404 }) } });
    const result = await inspectDatabaseReadiness({ ...config, aiEnabled: true, fetcher });
    expect(result.storage.buckets['narration-audio'].ready).toBe(true);
    expect(result.storage.buckets['stamp-artworks'].error).toBe('HTTP_404');
    expect(result.ready).toBe(false);
  });

  it.each([['places', 'places'], ['stamp_targets', 'activeStampTargets']])('rejects an empty required %s catalogue', async (table, name) => {
    const result = await inspectDatabaseReadiness({ ...config, fetcher: fixture({ overrides: { [`/rest/v1/${table}`]: new Response(null, { headers: { 'content-range': '*/0' } }) } }) });
    expect(result).toMatchObject({ ready: false, contentReady: false });
    expect(result.content.errors[name]).toBe('CONTENT_EMPTY');
  });

  it('does not mistake a successful HEAD without a count for verified content', async () => {
    const result = await inspectDatabaseReadiness({ ...config, fetcher: fixture({ overrides: { '/rest/v1/places': new Response(null) } }) });
    expect(result.content.places).toBeNull();
    expect(result.content.errors.places).toBe('COUNT_UNVERIFIED');
    expect(result.ready).toBe(false);
  });

  it('rejects empty or invalid non-null video sources and counts only validated references', async () => {
    const invalid = [{ video_url: '' }, { video_url: 'javascript:alert(1)' }, { video_url: 'https://video.example/not-video.html' }, { youtube_video_id: 'invalid' }];
    const failed = await inspectDatabaseReadiness({ ...config, shortsEnabled: true, fetcher: fixture({ overrides: { '/rest/v1/shorts': Response.json(invalid) } }) });
    expect(failed.content.errors.publishedVideos).toBe('NO_VALID_VIDEO_SOURCE_IN_SAMPLE');
    expect(failed.content).toMatchObject({ publishedVideos: 0, videoSourceRowsChecked: 4 });
    expect(failed.ready).toBe(false);
    const passed = await inspectDatabaseReadiness({ ...config, shortsEnabled: true, fetcher: fixture({ overrides: { '/rest/v1/shorts': Response.json([...invalid, { youtube_video_id: 'abcdefghijk' }]) } }) });
    expect(passed.content).toMatchObject({ publishedVideos: 1, videoSourceRowsChecked: 5 });
    expect(passed.ready).toBe(true);
  });

  it('stays ready without published videos while the shorts feed is switched off', async () => {
    const result = await inspectDatabaseReadiness({ ...config, fetcher: fixture({ overrides: { '/rest/v1/shorts': Response.json([]) } }) });
    expect(result.content).toMatchObject({ publishedVideos: 0 });
    expect(result.content.errors.publishedVideos).toBeUndefined();
    expect(result).toMatchObject({ ready: true, contentReady: true });
  });

  it('bounds all requests by one deadline and returns only sanitized failure codes', async () => {
    const fetcher: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('private-service-key in a transport message', 'TimeoutError')), { once: true });
    });
    const result = await inspectDatabaseReadiness({ ...config, fetcher, timeoutMs: 100 });
    expect(result).toMatchObject({ reachable: false, ready: false, schemaReady: false, storageReady: false, contentReady: false });
    expect(result.schema.metadataError).toBe('TimeoutError');
    expect(JSON.stringify(result)).not.toContain(config.secret);
  });
});

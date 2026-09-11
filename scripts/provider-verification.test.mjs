import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyProviders } from './provider-verification.mjs';
import { requiredDatabaseColumns, requiredDatabaseFunctions, requiredStorageBuckets } from '../src/backend/database-readiness.ts';

const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://database.example', SUPABASE_SECRET_KEY: 'private-database-key',
  TOUR_API_KEY: 'private-tour-key', KAKAO_REST_API_KEY: 'private-kakao-key', FEATURE_AI: 'false'
};
function fixture({ emptyVideos = false, rankingFailure = false } = {}) {
  const calls = [];
  const fetcher = async (input, options = {}) => {
    const url = new URL(String(input)); calls.push(url);
    if (url.hostname === 'database.example') {
      if (url.pathname === '/rest/v1/') return Response.json({
        definitions: Object.fromEntries(Object.entries(requiredDatabaseColumns).map(([name, columns]) => [name, { properties: Object.fromEntries(columns.map(column => [column, {}])), required: [] }])),
        paths: Object.fromEntries([...Object.keys(requiredDatabaseColumns).map(name => [`/${name}`, { get: {} }]), ...requiredDatabaseFunctions.map(name => [`/rpc/${name}`, { post: {} }])])
      });
      if (url.pathname.endsWith('/rpc/get_place_view_ranking')) return rankingFailure ? new Response(null, { status: 403 }) : Response.json([]);
      if (url.pathname.endsWith('/shorts')) return Response.json(emptyVideos ? [] : [{ video_url: '/videos/heritage.mp4' }]);
      if (options.method === 'HEAD') return new Response(null, { headers: { 'content-range': `*/${emptyVideos && url.pathname.endsWith('/shorts') ? 0 : 3}` } });
      const bucket = requiredStorageBuckets({ aiEnabled: false, communityEnabled: true }).find(item => url.pathname.endsWith(`/${item.id}`));
      if (bucket) return Response.json({ id: bucket.id, public: bucket.public, file_size_limit: 10485760, allowed_mime_types: bucket.types });
    }
    if (url.hostname === 'apis.data.go.kr') return Response.json({ response: { header: { resultCode: '0000' }, body: { totalCount: 10 } } });
    if (url.hostname === 'dapi.kakao.com') return Response.json({});
    throw new Error('Unexpected provider request');
  };
  return { fetcher, calls };
}

test('disabled AI does not call OpenAI or fail otherwise-ready launch checks', async () => {
  const { fetcher, calls } = fixture();
  const report = await verifyProviders({ env, fetcher });
  assert.equal(report.ok, true);
  assert.deepEqual(report.providers.openai, { configured: false, required: false, operational: false, skipped: true, reason: 'feature_disabled' });
  assert.equal(calls.some(url => url.hostname === 'api.openai.com'), false);
  for (const secret of [env.SUPABASE_SECRET_KEY, env.TOUR_API_KEY, env.KAKAO_REST_API_KEY]) assert.equal(JSON.stringify(report).includes(secret), false);
});

test('enabled AI without a key fails the provider release result', async () => {
  const { fetcher } = fixture();
  const report = await verifyProviders({ env: { ...env, FEATURE_AI: 'true' }, fetcher });
  assert.equal(report.ok, false);
  assert.equal(report.providers.openai.required, true);
  assert.equal(report.providers.openai.operational, false);
});

test('missing published videos and failed ranking execution each fail the release result', async () => {
  for (const failure of [{ emptyVideos: true }, { rankingFailure: true }]) {
    const { fetcher } = fixture(failure);
    const report = await verifyProviders({ env, fetcher });
    assert.equal(report.ok, false);
    assert.equal(report.providers.database.operational, false);
    assert.equal(report.providers.database.reachable, true);
  }
});

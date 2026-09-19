// Read-only provider checks shared by the CLI and its tests. Never log response
// bodies, credentials, private records, or external request URLs.
import { inspectDatabaseReadiness } from '../src/backend/database-readiness.ts';
import { verifyKakaoRoutes } from './kakao-route-verification.mjs';

export async function verifyProviders({ env = process.env, fetcher = fetch } = {}) {
  const providers = {};
  const enabled = value => value === undefined || !['false', '0', 'off'].includes(value.trim().toLowerCase());
  const aiEnabled = enabled(env.FEATURE_AI);
  const communityEnabled = enabled(env.FEATURE_COMMUNITY);
  // Opt-in, unlike the flags above: no FEATURE_SHORTS means the feed is still hidden.
  const shortsEnabled = ['1', 'true', 'on'].includes(env.FEATURE_SHORTS?.trim().toLowerCase() ?? '');
  function safeCode(error) {
    const value = [error?.code, error?.cause?.code, error?.name]
      .find(candidate => typeof candidate === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(candidate));
    return value ?? 'PROVIDER_ERROR';
  }
  async function probe(name, configured, task) {
    if (!configured) { providers[name] = { configured: false, required: true, operational: false, reason: 'not_configured' }; return; }
    const started = performance.now();
    try {
      const detail = await task();
      providers[name] = { configured: true, required: true, operational: true, latencyMs: Math.round(performance.now() - started), ...detail };
    } catch (error) {
      providers[name] = { configured: true, required: true, operational: false, latencyMs: Math.round(performance.now() - started), reason: safeCode(error) };
    }
  }
  async function request(url, headers = {}) {
    const response = await fetcher(url, { headers, signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!response.ok) throw Object.assign(new Error('Provider HTTP failure'), { code: `HTTP_${response.status}` });
    return response;
  }
  if (!aiEnabled) providers.openai = { configured: Boolean(env.OPENAI_API_KEY?.trim()), required: false, operational: false, skipped: true, reason: 'feature_disabled' };
  await Promise.all([
    probe('database', env.NEXT_PUBLIC_SUPABASE_URL?.trim() && env.SUPABASE_SECRET_KEY?.trim(), async () => {
      const details = await inspectDatabaseReadiness({
        url: env.NEXT_PUBLIC_SUPABASE_URL, secret: env.SUPABASE_SECRET_KEY,
        aiEnabled, communityEnabled, shortsEnabled, fetcher
      });
      return {
        ...details, operational: details.ready, places: details.content.places,
        activeStampTargets: details.content.activeStampTargets, publishedVideos: details.content.publishedVideos,
        rankingMigrationReady: details.schema.rankingReady
      };
    }),
    probe('tourApi', env.TOUR_API_KEY?.trim(), async () => {
      let key = env.TOUR_API_KEY;
      try { key = decodeURIComponent(key); } catch { /* Already raw. */ }
      const params = new URLSearchParams({ serviceKey: key, MobileOS: 'ETC', MobileApp: 'DalBbam', _type: 'json', pageNo: '1', numOfRows: '1', mapX: '129.2247', mapY: '35.8562', radius: '1000' });
      const payload = await (await request(`https://apis.data.go.kr/B551011/KorService2/locationBasedList2?${params}`)).json();
      const code = payload?.response?.header?.resultCode;
      if (code !== '0000' && code !== '00') throw Object.assign(new Error('Provider response failure'), { code: 'PROVIDER_RESPONSE_ERROR' });
      return { totalCount: Number(payload.response.body.totalCount) };
    }),
    probe('kakao', env.KAKAO_REST_API_KEY?.trim(), async () => {
      await request('https://dapi.kakao.com/v2/local/search/keyword.json?query=%EA%B2%BD%EC%A3%BC&size=1', { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` });
      const directions = await verifyKakaoRoutes({ key: env.KAKAO_REST_API_KEY, fetcher });
      return { directions, operational: Object.values(directions).every(route => route.operational) };
    }),
    ...(aiEnabled ? [probe('openai', env.OPENAI_API_KEY?.trim(), async () => {
      await request(`https://api.openai.com/v1/models/${encodeURIComponent(env.OPENAI_TEXT_MODEL || 'gpt-5.6-terra')}`, { Authorization: `Bearer ${env.OPENAI_API_KEY}` });
    })] : [])
  ]);
  return {
    checkedAt: new Date().toISOString(), readOnly: true, aiFeatureEnabled: aiEnabled,
    ok: Object.values(providers).every(provider => provider.required === false || provider.operational === true), providers
  };
}

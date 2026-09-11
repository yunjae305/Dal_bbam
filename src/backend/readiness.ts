import { getSupabaseEnv } from '@/backend/supabase/env';
import { fetchWithTimeout } from '@/backend/fetch-timeout';
import { getGyeongjuTourPlaces, TourApiError } from '@/backend/tour-api';
import { inspectDatabaseReadiness } from '@/backend/database-readiness';
import { isFeatureEnabled } from '@/backend/features';

export type ProviderReadiness = {
  configured: boolean;
  operational: boolean;
  reachable?: boolean;
  schemaReady?: boolean;
  storageReady?: boolean;
  contentReady?: boolean;
  latencyMs?: number;
  reason?: 'not_configured' | 'unreachable' | 'unauthorized' | 'misconfigured';
};

export type ReadinessSnapshot = {
  checkedAt: string;
  database: ProviderReadiness;
  tourApi: ProviderReadiness;
  kakao: ProviderReadiness;
  openai: ProviderReadiness;
};

const CACHE_TTL_MS = 30_000;
let cached: { expiresAt: number; value: ReadinessSnapshot } | null = null;
let databaseCached: { expiresAt: number; key: string; value: ProviderReadiness } | null = null;
let databasePending: { key: string; task: Promise<ProviderReadiness> } | null = null;

function result(
  configured: boolean,
  startedAt: number,
  operational: boolean,
  reason?: ProviderReadiness['reason']
): ProviderReadiness {
  return {
    configured,
    operational,
    latencyMs: Date.now() - startedAt,
    ...(reason ? { reason } : {})
  };
}

export async function checkDatabase(): Promise<ProviderReadiness> {
  const startedAt = Date.now();
  const env = getSupabaseEnv();
  const unavailable = { reachable: false, schemaReady: false, storageReady: false, contentReady: false };
  if (!env.configured || !env.url || !env.secretKey) return { ...result(false, startedAt, false, 'not_configured'), ...unavailable };
  const aiEnabled = isFeatureEnabled('ai');
  const communityEnabled = isFeatureEnabled('community');
  const key = `${env.url}:${env.secretKey}:${aiEnabled}:${communityEnabled}`;
  if (databaseCached?.key === key && databaseCached.expiresAt > Date.now()) return databaseCached.value;
  if (databasePending?.key === key) return databasePending.task;
  const task = (async (): Promise<ProviderReadiness> => {
    try {
      const checked = await inspectDatabaseReadiness({ url: env.url!, secret: env.secretKey!, aiEnabled, communityEnabled });
      return {
        ...result(true, startedAt, checked.ready, checked.ready ? undefined : checked.reachable ? 'misconfigured' : 'unreachable'),
        reachable: checked.reachable, schemaReady: checked.schemaReady, storageReady: checked.storageReady, contentReady: checked.contentReady
      };
    } catch { return { ...result(true, startedAt, false, 'unreachable'), ...unavailable }; }
  })();
  databasePending = { key, task };
  try {
    const value = await task;
    databaseCached = { key, value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } finally { if (databasePending?.task === task) databasePending = null; }
}

async function checkTourApi(): Promise<ProviderReadiness> {
  const startedAt = Date.now();
  const configured = Boolean(process.env.TOUR_API_KEY?.trim());
  if (!configured) return result(false, startedAt, false, 'not_configured');

  try {
    // A readiness probe must observe the provider now, not a 30-minute-old cache entry.
    await getGyeongjuTourPlaces({ numOfRows: '1' }, { bypassCache: true });
    return result(true, startedAt, true);
  } catch (error) {
    const unauthorized = error instanceof TourApiError && (error.status === 401 || error.status === 403);
    return result(true, startedAt, false, unauthorized ? 'unauthorized' : 'unreachable');
  }
}

async function checkKakao(): Promise<ProviderReadiness> {
  const startedAt = Date.now();
  const key = process.env.KAKAO_REST_API_KEY?.trim();
  if (!key) return result(false, startedAt, false, 'not_configured');

  try {
    const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
    url.searchParams.set('query', '경주');
    url.searchParams.set('size', '1');
    const response = await fetchWithTimeout(url, {
      headers: { Authorization: `KakaoAK ${key}`, Accept: 'application/json' },
      cache: 'no-store'
    });
    return response.ok
      ? result(true, startedAt, true)
      : result(true, startedAt, false, response.status === 401 || response.status === 403 ? 'unauthorized' : 'unreachable');
  } catch {
    return result(true, startedAt, false, 'unreachable');
  }
}

function openAiFailureReason(status: number): ProviderReadiness['reason'] {
  if (status === 401 || status === 403) return 'unauthorized';
  // The key works but the configured model does not exist (or is not enabled for this key).
  if (status === 404) return 'misconfigured';
  return 'unreachable';
}

async function checkOpenAi(): Promise<ProviderReadiness> {
  const startedAt = Date.now();
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return result(false, startedAt, false, 'not_configured');

  const model = process.env.OPENAI_TEXT_MODEL?.trim() || 'gpt-5.6-terra';
  try {
    const response = await fetchWithTimeout(
      `https://api.openai.com/v1/models/${encodeURIComponent(model)}`,
      {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        cache: 'no-store'
      }
    );
    return response.ok
      ? result(true, startedAt, true)
      : result(true, startedAt, false, openAiFailureReason(response.status));
  } catch {
    return result(true, startedAt, false, 'unreachable');
  }
}

export async function getReadinessSnapshot(options?: { force?: boolean }): Promise<ReadinessSnapshot> {
  if (!options?.force && process.env.NODE_ENV !== 'test' && cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const [database, tourApi, kakao, openai] = await Promise.all([
    checkDatabase(),
    checkTourApi(),
    checkKakao(),
    checkOpenAi()
  ]);
  const value = {
    checkedAt: new Date().toISOString(),
    database,
    tourApi,
    kakao,
    openai
  };

  cached = { expiresAt: Date.now() + CACHE_TTL_MS, value };
  return value;
}

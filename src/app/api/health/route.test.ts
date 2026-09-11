import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/health/route';

vi.mock('@/backend/supabase/env', () => ({
  getSupabaseEnv: () => ({ authConfigured: true, configured: true })
}));

const readiness = vi.hoisted(() => ({
  database: { configured: true, operational: true, reachable: true, schemaReady: true, storageReady: true, contentReady: true },
  openai: { configured: true, operational: true, reason: undefined as string | undefined }
}));

vi.mock('@/backend/readiness', () => ({
  getReadinessSnapshot: async () => ({
    checkedAt: '2026-08-28T00:00:00.000Z',
    database: { ...readiness.database },
    tourApi: { configured: true, operational: true },
    kakao: { configured: true, operational: true },
    openai: { ...readiness.openai }
  })
}));

describe('GET /api/health', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv, NODE_ENV: 'test', FRONTEND_URL: 'https://tour.dalbbam.kr',
      KAKAO_REDIRECT_URI: 'https://tour.dalbbam.kr/api/auth/kakao/callback', KAKAO_MAP_JS_ALLOWED_ORIGINS: 'https://tour.dalbbam.kr',
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-fixture',
      SUPABASE_SECRET_KEY: 'server-fixture', TOUR_API_KEY: 'tour-fixture', KAKAO_REST_API_KEY: 'kakao-fixture',
      NEXT_PUBLIC_KAKAO_MAP_JS_KEY: 'public-key', JWT_SECRET: '8d027386f94fb9327bae7bf614239a531',
      CRON_SECRET: 'a710e3d48a1ff7263973f16a9e94dab2', ADMIN_EMAILS: 'admin@dalbbam.kr',
      DEMO_MODE_ENABLED: 'false', DEMO_ISOLATED_TEST: 'false', PUBLIC_OPERATOR_NAME: '달밤',
      PRIVACY_CONTACT_EMAIL: 'privacy@dalbbam.kr', LOCATION_TERMS_EFFECTIVE_DATE: '2026-09-06',
      FEATURE_AI: 'true', OPENAI_API_KEY: 'openai-fixture', FEATURE_COMMUNITY: 'true'
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    readiness.openai = { configured: true, operational: true, reason: undefined };
    readiness.database = { configured: true, operational: true, reachable: true, schemaReady: true, storageReady: true, contentReady: true };
  });

  it('does not fail the release gate on OpenAI when the AI feature is switched off', async () => {
    readiness.openai = { configured: false, operational: false, reason: 'not_configured' };
    process.env.FEATURE_AI = 'false';

    const payload = await (await GET()).json();
    expect(payload.features).toEqual({ ai: false, community: true });
    expect(payload.readiness.ai).toBe(true);
    expect(payload.providers.openai.operational).toBe(false);

    process.env.FEATURE_AI = 'true';
    const enabled = await (await GET()).json();
    expect(enabled.features.ai).toBe(true);
    expect(enabled.readiness.ai).toBe(false);
  });

  it('uses provider probe results instead of inferring AI readiness from key presence', async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.JWT_SECRET = 'server-only-secret-with-at-least-32-characters';
    process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY = 'public-key';
    process.env.FRONTEND_URL = 'https://tour.dalbbam.kr';
    process.env.KAKAO_MAP_JS_ALLOWED_ORIGINS = 'http://localhost:3000,https://tour.dalbbam.kr';
    process.env.PUBLIC_OPERATOR_NAME = '달밤';
    process.env.PRIVACY_CONTACT_EMAIL = 'privacy@dalbbam.kr';
    process.env.LOCATION_TERMS_EFFECTIVE_DATE = '2026-08-28';

    const payload = await (await GET()).json();
    expect(payload.readiness.ai).toBe(true);
    expect(payload.providers.openai.operational).toBe(true);
  });

  it('never exposes provider keys and reports release readiness dimensions', async () => {
    const serverOnlyKey = 'server-only-test-value';
    process.env.OPENAI_API_KEY = serverOnlyKey;
    process.env.JWT_SECRET = 'server-only-secret-with-at-least-32-characters';
    process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY = 'public-key';
    process.env.FRONTEND_URL = 'https://tour.dalbbam.kr';
    process.env.KAKAO_MAP_JS_ALLOWED_ORIGINS = 'https://tour.dalbbam.kr';
    process.env.PUBLIC_OPERATOR_NAME = '달밤';
    process.env.PRIVACY_CONTACT_EMAIL = 'privacy@dalbbam.kr';
    process.env.LOCATION_TERMS_EFFECTIVE_DATE = '2026-08-28';

    const response = await GET();
    const payload = await response.json();

    expect(payload.ok).toBe(true);
    expect(payload.readiness).toMatchObject({
      auth: true,
      database: true,
      tourApi: true,
      kakaoMap: true,
      kakaoMapDomain: true,
      ai: true,
      legal: true
    });
    expect(JSON.stringify(payload)).not.toContain(serverOnlyKey);
    expect(payload.configuration.kakaoMap).toEqual({
      frontendOriginConfigured: true,
      declaredOriginCount: 1,
      frontendOriginDeclared: true
    });
    expect(JSON.stringify(payload)).not.toContain('https://tour.dalbbam.kr');
    expect(payload).not.toHaveProperty('OPENAI_API_KEY');
  });

  it.each(['schemaReady', 'storageReady', 'contentReady'] as const)('fails closed when database connectivity succeeds but %s is incomplete', async key => {
    process.env = { ...process.env, NODE_ENV: 'production' };
    readiness.database[key] = false;
    const response = await GET();
    expect(response.status).toBe(503);
    expect((await response.json()).ok).toBe(false);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it.each([
    { DEMO_MODE_ENABLED: 'true' }, { ADMIN_EMAILS: '' }, { CRON_SECRET: '' },
    { FRONTEND_URL: 'http://localhost:3000' }, { KAKAO_REDIRECT_URI: 'https://wrong.dalbbam.kr/api/auth/kakao/callback' }
  ])('rejects a production misconfiguration even when every provider responds', async changes => {
    process.env = { ...process.env, ...changes, NODE_ENV: 'production' };
    const response = await GET();
    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload.ok).toBe(false);
    expect(payload.configuration.release.ready).toBe(false);
    expect(payload.configuration.release.issues.length).toBeGreaterThan(0);
  });
});

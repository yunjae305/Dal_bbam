import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/health/route';

vi.mock('@/backend/supabase/env', () => ({
  getSupabaseEnv: () => ({ authConfigured: true, configured: true })
}));

const readiness = vi.hoisted(() => ({
  openai: { configured: true, operational: true, reason: undefined as string | undefined }
}));

vi.mock('@/backend/readiness', () => ({
  getReadinessSnapshot: async () => ({
    checkedAt: '2026-08-28T00:00:00.000Z',
    database: { configured: true, operational: true },
    tourApi: { configured: true, operational: true },
    kakao: { configured: true, operational: true },
    openai: { ...readiness.openai }
  })
}));

describe('GET /api/health', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    readiness.openai = { configured: true, operational: true, reason: undefined };
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
    process.env.FRONTEND_URL = 'https://dalbbam.example';
    process.env.KAKAO_MAP_JS_ALLOWED_ORIGINS = 'http://localhost:3000,https://dalbbam.example';
    process.env.PUBLIC_OPERATOR_NAME = '달밤';
    process.env.PRIVACY_CONTACT_EMAIL = 'privacy@example.com';
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
    process.env.FRONTEND_URL = 'https://dalbbam.example';
    process.env.KAKAO_MAP_JS_ALLOWED_ORIGINS = 'https://dalbbam.example';
    process.env.PUBLIC_OPERATOR_NAME = '달밤';
    process.env.PRIVACY_CONTACT_EMAIL = 'privacy@example.com';
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
    expect(JSON.stringify(payload)).not.toContain('https://dalbbam.example');
    expect(payload).not.toHaveProperty('OPENAI_API_KEY');
  });
});

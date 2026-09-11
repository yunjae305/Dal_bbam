import { describe, expect, it } from 'vitest';
import { publicHttpsUrl, validateReleaseConfiguration } from './release-configuration';

function environment(): Record<string, string> {
  return {
    FRONTEND_URL: 'https://tour.dalbbam.kr', KAKAO_REDIRECT_URI: 'https://tour.dalbbam.kr/api/auth/kakao/callback',
    KAKAO_MAP_JS_ALLOWED_ORIGINS: 'https://tour.dalbbam.kr', NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-fixture', SUPABASE_SECRET_KEY: 'server-fixture',
    TOUR_API_KEY: 'tour-fixture', KAKAO_REST_API_KEY: 'kakao-fixture', NEXT_PUBLIC_KAKAO_MAP_JS_KEY: 'map-fixture',
    JWT_SECRET: '8d027386f94fb9327bae7bf614239a531', CRON_SECRET: 'a710e3d48a1ff7263973f16a9e94dab2',
    ADMIN_EMAILS: 'admin@dalbbam.kr', DEMO_MODE_ENABLED: 'false', PUBLIC_OPERATOR_NAME: '달밤 운영팀',
    PRIVACY_CONTACT_EMAIL: 'privacy@dalbbam.kr', LOCATION_TERMS_EFFECTIVE_DATE: '2026-09-06', FEATURE_AI: 'false'
  };
}

describe('public release configuration', () => {
  it('accepts an explicit launch without paid AI or a database migration credential', () => {
    expect(validateReleaseConfiguration(environment())).toEqual({ ready: true, issues: [] });
  });

  it('rejects local, private, placeholder and credential-bearing deployment URLs', () => {
    for (const url of ['http://tour.dalbbam.kr', 'https://localhost', 'https://127.0.0.1', 'https://10.0.0.2',
      'https://192.168.1.1', 'https://172.16.0.1', 'https://[::1]', 'https://your-domain.example',
      'https://example.com', 'https://example.com.', 'https://localhost.', 'https://tour.example.',
      'https://224.0.0.1', 'https://255.255.255.255', 'https://8.8.8.8', 'https://user:password@tour.dalbbam.kr']) expect(publicHttpsUrl(url)).toBeNull();
  });

  it('does not accept prefix matching or a callback for a different application', () => {
    const env = environment();
    env.KAKAO_REDIRECT_URI = 'https://tour.dalbbam.kr.attacker.net/api/auth/kakao/callback';
    env.KAKAO_MAP_JS_ALLOWED_ORIGINS = 'https://tour.dalbbam.kr/wrong-path';
    expect(validateReleaseConfiguration(env).issues.map(issue => issue.code)).toEqual(['KAKAO_CALLBACK_MISMATCH', 'KAKAO_MAP_ORIGIN_REQUIRED']);
  });

  it('rejects enabled demo access, isolated test bypass, weak secrets and impossible policy dates', () => {
    for (const override of [{ DEMO_MODE_ENABLED: 'true' }, { DEMO_ISOLATED_TEST: 'true' },
      { JWT_SECRET: 'replace-with-a-random-secret-of-at-least-32-characters' }, { CRON_SECRET: 'x'.repeat(64) },
      { ADMIN_EMAILS: 'admin@example.com' }, { ADMIN_EMAILS: 'admin@example.com.' },
      { ADMIN_EMAILS: 'admin@foo/bar.kr' }, { PRIVACY_CONTACT_EMAIL: 'privacy@-invalid.kr' },
      { LOCATION_TERMS_EFFECTIVE_DATE: '2026-02-30' }]) {
      expect(validateReleaseConfiguration({ ...environment(), ...override }).ready).toBe(false);
    }
  });

  it('requires an explicit AI decision and reports enabled AI with no key as incomplete', () => {
    const env = environment();
    delete env.FEATURE_AI;
    expect(validateReleaseConfiguration(env).issues.map(issue => issue.code)).toContain('AI_MODE_REQUIRED');
    env.FEATURE_AI = 'true';
    expect(validateReleaseConfiguration(env).issues.map(issue => issue.code)).toContain('AI_KEY_REQUIRED');
    env.OPENAI_API_KEY = 'api-key-fixture';
    expect(validateReleaseConfiguration(env).ready).toBe(true);
  });

  it('reports field names without echoing secret, account, address or operator values', () => {
    const env: Record<string, string> = { ...environment(), JWT_SECRET: 'sensitive-short-secret', ADMIN_EMAILS: 'private-invalid-value', FRONTEND_URL: 'http://private-server' };
    const serialized = JSON.stringify(validateReleaseConfiguration(env));
    for (const value of [env.JWT_SECRET, env.ADMIN_EMAILS, env.FRONTEND_URL, env.SUPABASE_SECRET_KEY, env.PRIVACY_CONTACT_EMAIL]) expect(serialized).not.toContain(value);
    expect(serialized).toContain('JWT_SECRET');
  });
});

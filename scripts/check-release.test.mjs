import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRelease, parseReleaseArgs } from './check-release.mjs';

const env = {
  FRONTEND_URL: 'https://tour.dalbbam.kr', KAKAO_REDIRECT_URI: 'https://tour.dalbbam.kr/api/auth/kakao/callback',
  KAKAO_MAP_JS_ALLOWED_ORIGINS: 'https://tour.dalbbam.kr', NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-fixture', SUPABASE_SECRET_KEY: 'secret-fixture', TOUR_API_KEY: 'tour-fixture',
  KAKAO_REST_API_KEY: 'kakao-fixture', NEXT_PUBLIC_KAKAO_MAP_JS_KEY: 'map-fixture',
  JWT_SECRET: '8d027386f94fb9327bae7bf614239a531', CRON_SECRET: 'a710e3d48a1ff7263973f16a9e94dab2',
  ADMIN_EMAILS: 'admin@dalbbam.kr', DEMO_MODE_ENABLED: 'false', PUBLIC_OPERATOR_NAME: '달밤',
  PRIVACY_CONTACT_EMAIL: 'privacy@dalbbam.kr', LOCATION_TERMS_EFFECTIVE_DATE: '2026-09-06', FEATURE_AI: 'false'
};
function providers() {
  return { providers: {
    database: { operational: true, reachable: true, schemaReady: true, storageReady: true, contentReady: true },
    tourApi: { operational: true }, kakao: { operational: true }, openai: { operational: false }, gemini: { operational: true }
  } };
}

test('configuration-only makes no network requests and clearly states its limited scope', async () => {
  const report = await checkRelease(env, { configurationOnly: true }, { probeProviders: () => assert.fail('unexpected network') });
  assert.equal(report.ready, true);
  assert.equal(report.scope, 'configuration');
  assert.equal(report.verification.actualUserFlows, 'not_run');
});
test('a full gate requires schema, storage and launch content even when a places query succeeds', async () => {
  for (const key of ['schemaReady', 'storageReady', 'contentReady']) {
    const response = providers();
    response.providers.database[key] = false;
    const report = await checkRelease(env, {}, { probeProviders: async () => response });
    assert.equal(report.ready, false);
    assert.equal(report.issues.some(issue => issue.fields.includes(key)), true);
  }
});
test('missing or malformed provider results fail closed and disabled AI does not fail a valid launch', async () => {
  assert.equal((await checkRelease(env, {}, { probeProviders: async () => null })).ready, false);
  assert.equal((await checkRelease(env, {}, { probeProviders: async () => providers() })).ready, true);
  assert.equal((await checkRelease({ ...env, FEATURE_AI: 'true', OPENAI_API_KEY: 'key' }, {}, { probeProviders: async () => providers() })).ready, false);
});
test('deployed verification rejects a successful HTTP response with a failing or incomplete readiness body', async () => {
  for (const body of [{ ok: false }, { ok: true }, { ok: true, configuration: { release: { ready: true } }, readiness: { database: true } }]) {
    const report = await checkRelease(env, { baseUrl: env.FRONTEND_URL }, {
      probeProviders: async () => providers(), fetch: async () => new Response(JSON.stringify(body))
    });
    assert.equal(report.ready, false);
    assert.equal(report.deployedHealth.verified, false);
  }
});
test('deployed verification accepts the complete contract without claiming user flows or echoing provider diagnostics', async () => {
  const response = providers();
  response.providers.database.error = 'secret-must-never-be-printed';
  const report = await checkRelease(env, { baseUrl: env.FRONTEND_URL }, {
    probeProviders: async () => response,
    fetch: async (url, options) => {
      assert.equal(String(url), 'https://tour.dalbbam.kr/api/health');
      assert.equal(options.redirect, 'error');
      return new Response(JSON.stringify({ ok: true, configuration: { release: { ready: true } },
        readiness: { database: true, databaseSchema: true, storage: true, launchContent: true, releaseConfiguration: true } }));
    }
  });
  assert.equal(report.ready, true);
  assert.equal(report.verification.remoteWrites, 'not_run');
  assert.equal(JSON.stringify(report).includes('secret-must-never-be-printed'), false);
});
test('unexpected deployment origins and write flags are rejected', async () => {
  assert.throws(() => parseReleaseArgs(['--apply']));
  assert.throws(() => parseReleaseArgs(['--configuration-only', '--base-url', env.FRONTEND_URL]));
  const report = await checkRelease(env, { baseUrl: 'https://other.dalbbam.kr' }, {
    probeProviders: async () => providers(), fetch: () => assert.fail('unexpected external request')
  });
  assert.equal(report.ready, false);
  assert.equal(report.deployedHealth.verified, false);
});

test('with AI on, the configured Gemini provider is the one that must answer', async () => {
  const aiEnv = { ...env, FEATURE_AI: 'true', GEMINI_API_KEY: 'test-gemini-key' };
  const ready = await checkRelease(aiEnv, {}, { probeProviders: () => providers() });
  assert.equal(ready.issues.length, 0, JSON.stringify(ready.issues));

  const response = providers();
  response.providers.gemini = { operational: false };
  const failed = await checkRelease(aiEnv, {}, { probeProviders: () => response });
  assert.ok(failed.issues.some(issue => issue.code === 'PROVIDER_NOT_READY' && issue.fields.includes('gemini')));
});

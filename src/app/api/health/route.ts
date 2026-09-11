import { NextResponse } from 'next/server';
import { getSupabaseEnv } from '@/backend/supabase/env';
import { getReadinessSnapshot } from '@/backend/readiness';
import { configuredFrontendOrigin, configuredKakaoMapOrigins } from '@/backend/kakao-map';
import { isFeatureEnabled } from '@/backend/features';
import { usableReleaseSecret, validateReleaseConfiguration } from '@/shared/release-configuration';

export async function GET() {
  const supabase = getSupabaseEnv();
  const providers = await getReadinessSnapshot();
  const frontendOrigin = configuredFrontendOrigin();
  const kakaoMapOrigins = configuredKakaoMapOrigins();
  const kakaoMapDomainDeclared = Boolean(
    frontendOrigin && kakaoMapOrigins.includes(frontendOrigin)
  );
  const releaseConfiguration = validateReleaseConfiguration(process.env);
  const sessionSecret = usableReleaseSecret(process.env.JWT_SECRET ?? process.env.SESSION_SECRET);
  const aiEnabled = isFeatureEnabled('ai');
  const readiness = {
    auth: supabase.authConfigured && providers.database.operational,
    database: providers.database.operational,
    databaseSchema: providers.database.schemaReady === true,
    storage: providers.database.storageReady === true,
    launchContent: providers.database.contentReady === true,
    tourApi: providers.tourApi.operational,
    kakaoMap: Boolean(process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY?.trim()) && providers.kakao.operational,
    kakaoMapDomain: kakaoMapDomainDeclared,
    // The provider probe checks Kakao Local search, not paid route execution.
    kakaoMobility: null,
    // A deliberately disabled AI feature must not fail the release gate.
    ai: !aiEnabled || providers.openai.operational,
    sessionSecret,
    legal: !releaseConfiguration.issues.some(issue => ['OPERATOR_REQUIRED', 'PRIVACY_CONTACT_REQUIRED', 'POLICY_DATE_REQUIRED'].includes(issue.code)),
    releaseConfiguration: releaseConfiguration.ready
  };
  const ok = readiness.auth
    && readiness.database
    && readiness.tourApi
    && readiness.kakaoMap
    && readiness.kakaoMapDomain
    && readiness.ai
    && readiness.sessionSecret
    && readiness.legal
    && readiness.databaseSchema
    && readiness.storage
    && readiness.launchContent
    && readiness.releaseConfiguration;

  return NextResponse.json({
    ok,
    service: 'gyeongju-travel-next-mvp',
    stack: ['Next.js App Router', 'TypeScript', 'Supabase/Postgres', 'Route Handler', 'PWA'],
    readiness,
    features: {
      ai: aiEnabled,
      community: isFeatureEnabled('community')
    },
    verification: {
      kakaoMobility: 'not_probed', socialLogin: 'not_verified',
      aiGeneration: 'not_verified', actualVideoPlayback: 'not_verified'
    },
    configuration: {
      release: releaseConfiguration,
      kakaoMap: {
        frontendOriginConfigured: Boolean(frontendOrigin),
        declaredOriginCount: kakaoMapOrigins.length,
        frontendOriginDeclared: kakaoMapDomainDeclared
      }
    },
    providers
  }, {
    status: ok || process.env.NODE_ENV !== 'production' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' }
  });
}

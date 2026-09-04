import { NextResponse } from 'next/server';
import { getSupabaseEnv } from '@/backend/supabase/env';
import { getReadinessSnapshot } from '@/backend/readiness';
import { configuredFrontendOrigin, configuredKakaoMapOrigins } from '@/backend/kakao-map';
import { isFeatureEnabled } from '@/backend/features';

function legalConfigurationReady(): boolean {
  const operator = process.env.PUBLIC_OPERATOR_NAME?.trim() ?? '';
  const email = process.env.PRIVACY_CONTACT_EMAIL?.trim() ?? '';
  const effectiveDate = process.env.LOCATION_TERMS_EFFECTIVE_DATE?.trim() ?? '';
  const parsedDate = new Date(`${effectiveDate}T00:00:00Z`);
  return operator.length >= 2
    && /^\S+@\S+\.\S+$/.test(email)
    && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)
    && !Number.isNaN(parsedDate.getTime())
    && parsedDate.toISOString().slice(0, 10) === effectiveDate;
}

export async function GET() {
  const supabase = getSupabaseEnv();
  const providers = await getReadinessSnapshot();
  const frontendOrigin = configuredFrontendOrigin();
  const kakaoMapOrigins = configuredKakaoMapOrigins();
  const kakaoMapDomainDeclared = Boolean(
    frontendOrigin && kakaoMapOrigins.includes(frontendOrigin)
  );
  const sessionSecret = Boolean(
    (process.env.JWT_SECRET ?? process.env.SESSION_SECRET)?.length
    && (process.env.JWT_SECRET ?? process.env.SESSION_SECRET)!.length >= 32
  );
  const aiEnabled = isFeatureEnabled('ai');
  const readiness = {
    auth: supabase.authConfigured && providers.database.operational,
    database: providers.database.operational,
    tourApi: providers.tourApi.operational,
    kakaoMap: Boolean(process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY?.trim()) && providers.kakao.operational,
    kakaoMapDomain: kakaoMapDomainDeclared,
    kakaoMobility: providers.kakao.operational,
    // A deliberately disabled AI feature must not fail the release gate.
    ai: !aiEnabled || providers.openai.operational,
    sessionSecret,
    legal: legalConfigurationReady()
  };
  const ok = readiness.auth
    && readiness.database
    && readiness.tourApi
    && readiness.kakaoMap
    && readiness.kakaoMapDomain
    && readiness.ai
    && readiness.sessionSecret
    && readiness.legal;

  return NextResponse.json({
    ok,
    service: 'gyeongju-travel-next-mvp',
    stack: ['Next.js App Router', 'TypeScript', 'Supabase/Postgres', 'Route Handler', 'PWA'],
    readiness,
    features: {
      ai: aiEnabled,
      community: isFeatureEnabled('community')
    },
    configuration: {
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

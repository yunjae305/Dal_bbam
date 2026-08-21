import { NextResponse } from 'next/server';
import { getSupabaseEnv } from '@/backend/supabase/env';

export function GET() {
  const supabase = getSupabaseEnv();
  return NextResponse.json({
    ok: true,
    service: 'gyeongju-travel-next-mvp',
    stack: ['Next.js App Router', 'TypeScript', 'Supabase/Postgres', 'Route Handler', 'PWA'],
    readiness: {
      auth: supabase.authConfigured,
      database: supabase.configured,
      tourApi: Boolean(process.env.TOUR_API_KEY),
      kakaoMap: Boolean(process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY),
      kakaoMobility: Boolean(process.env.KAKAO_REST_API_KEY),
      ai: Boolean(process.env.OPENAI_API_KEY?.trim()),
      sessionSecret: Boolean((process.env.JWT_SECRET ?? process.env.SESSION_SECRET)?.length && (process.env.JWT_SECRET ?? process.env.SESSION_SECRET)!.length >= 32)
    }
  });
}

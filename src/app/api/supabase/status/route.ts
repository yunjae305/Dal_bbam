import { NextResponse } from 'next/server';
import { getSupabaseEnv } from '@/backend/supabase/env';
import { checkDatabase } from '@/backend/readiness';

export async function GET() {
  const env = getSupabaseEnv();
  // This endpoint answers "is the database usable?"; probing TourAPI, Kakao
  // and OpenAI here only adds latency and external quota usage.
  const database = await checkDatabase();

  return NextResponse.json({
    configured: env.configured,
    authConfigured: env.authConfigured,
    operational: database.operational,
    checkedAt: new Date().toISOString(),
    mode: database.operational ? 'supabase-ready' : 'fallback-data'
  }, { headers: { 'Cache-Control': 'no-store' } });
}

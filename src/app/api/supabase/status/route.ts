import { NextResponse } from 'next/server';
import { getSupabaseEnv } from '@/backend/supabase/env';

export function GET() {
  const env = getSupabaseEnv();

  return NextResponse.json({
    configured: env.configured,
    authConfigured: env.authConfigured,
    mode: env.configured ? 'supabase-ready' : 'fallback-data'
  });
}

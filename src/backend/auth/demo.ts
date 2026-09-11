const EXTERNAL_CREDENTIALS = [
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY',
  'SUPABASE_DB_URL', 'SUPABASE_ACCESS_TOKEN', 'DATABASE_URL', 'POSTGRES_URL',
  'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING',
  'TOUR_API_KEY', 'KAKAO_REST_API_KEY', 'KAKAO_CLIENT_ID', 'KAKAO_CLIENT_SECRET',
  'NEXT_PUBLIC_KAKAO_MAP_JS_KEY', 'NEXT_PUBLIC_KAKAO_MAP_KEY',
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
  'ADMIN_API_SECRET', 'CRON_SECRET'
] as const;

/** Production builds may use demo sessions only inside the credential-free local test harness. */
export function isIsolatedDemoTestEnvironment(): boolean {
  if (process.env.DEMO_ISOLATED_TEST !== 'true') return false;
  if (EXTERNAL_CREDENTIALS.some(name => Boolean(process.env[name]?.trim()))) return false;

  try {
    const frontend = new URL(process.env.FRONTEND_URL ?? '');
    return ['http:', 'https:'].includes(frontend.protocol)
      && ['localhost', '127.0.0.1', '[::1]'].includes(frontend.hostname)
      && !frontend.username && !frontend.password;
  } catch {
    return false;
  }
}

export function isDemoModeEnabled(): boolean {
  return process.env.DEMO_MODE_ENABLED === 'true'
    && Boolean(process.env.DEMO_EMAIL?.trim())
    && Boolean(process.env.DEMO_PASSWORD)
    && (process.env.NODE_ENV !== 'production' || isIsolatedDemoTestEnvironment());
}

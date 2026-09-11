/** Public fixtures and local sessions only: no developer DB, provider or paid AI access. */
export const isolatedTestEnv: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: '', SUPABASE_URL: '', SUPABASE_ANON_KEY: '',
  SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_DB_URL: '', SUPABASE_ACCESS_TOKEN: '',
  DATABASE_URL: '', POSTGRES_URL: '', POSTGRES_PRISMA_URL: '', POSTGRES_URL_NON_POOLING: '',
  TOUR_API_KEY: '', KAKAO_REST_API_KEY: '', NEXT_PUBLIC_KAKAO_MAP_JS_KEY: '',
  KAKAO_CLIENT_ID: '', KAKAO_CLIENT_SECRET: '', NEXT_PUBLIC_KAKAO_MAP_KEY: '',
  OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '',
  CRON_SECRET: '', FEATURE_AI: 'false', HERITAGE_API_ENABLED: 'false',
  FRONTEND_URL: 'http://127.0.0.1:3200', KAKAO_REDIRECT_URI: 'http://127.0.0.1:3200/api/auth/kakao/callback',
  ADMIN_EMAILS: 'browser-test@example.com', ADMIN_API_SECRET: '',
  JWT_SECRET: 'local-e2e-only-secret-with-at-least-32-characters',
  DEMO_MODE_ENABLED: 'true', DEMO_ISOLATED_TEST: 'true',
  DEMO_EMAIL: 'browser-test@example.com', DEMO_PASSWORD: 'local-e2e-only-password'
};

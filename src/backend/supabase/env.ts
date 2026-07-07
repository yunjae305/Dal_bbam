export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const serverKey = secretKey || publishableKey;

  return {
    url,
    publishableKey,
    secretKey,
    serverKey,
    configured: Boolean(url && serverKey),
    authConfigured: Boolean(url && publishableKey)
  };
}

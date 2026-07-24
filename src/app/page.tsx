import { cookies } from 'next/headers';
import { TravelMvpApp } from '@/frontend/components/travel-mvp-app';
import { getTourMvpData } from '@/backend/tour-mvp-data';
import { createSupabaseServerClient } from '@/backend/supabase/server';
import { verifySessionToken, SESSION_COOKIE } from '@/backend/auth/session';
import { isLang, localeCookieName } from '@/shared/i18n';

export default async function Page() {
  const supabase = await createSupabaseServerClient();

  let userEmail: string | null = null;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    userEmail = verifySessionToken(token)?.email ?? null;
  }

  if (!userEmail && supabase) {
    userEmail = (await supabase.auth.getUser()).data.user?.email ?? null;
  }

  const savedLocale = cookieStore.get(localeCookieName)?.value;
  const locale = isLang(savedLocale) ? savedLocale : 'ko';

  return <TravelMvpApp initialData={await getTourMvpData(locale)} userEmail={userEmail} />;
}

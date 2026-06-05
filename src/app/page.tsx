import { cookies } from 'next/headers';
import { TravelMvpApp } from '@/frontend/components/travel-mvp-app';
import { getMvpData } from '@/backend/data';
import { createSupabaseServerClient } from '@/backend/supabase/server';
import { verifySessionToken, SESSION_COOKIE } from '@/backend/auth/session';

export default async function Page() {
  const supabase = await createSupabaseServerClient();

  let userEmail: string | null = null;

  if (supabase) {
    userEmail = (await supabase.auth.getUser()).data.user?.email ?? null;
  } else {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (token) {
      userEmail = verifySessionToken(token)?.email ?? null;
    }
  }

  return <TravelMvpApp initialData={getMvpData()} userEmail={userEmail} />;
}

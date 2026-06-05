import { TravelMvpApp } from '@/frontend/components/travel-mvp-app';
import { getMvpData } from '@/backend/data';
import { createSupabaseServerClient } from '@/backend/supabase/server';

export default async function Page() {
  const supabase = await createSupabaseServerClient();
  const userEmail = supabase
    ? (await supabase.auth.getUser()).data.user?.email ?? null
    : null;

  return <TravelMvpApp initialData={getMvpData()} userEmail={userEmail} />;
}

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/backend/auth/current-user';
import { createSupabaseServerClient } from '@/backend/supabase/server';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const supabase = user.supabaseUserId
    ? await createSupabaseServerClient()
    : createSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ items: [], persisted: false });
  }

  const { data, error } = await supabase
    .from('stamps')
    .select('id, acquired_at, lat, lng, places(id, content_id, name, category, image_url)')
    .eq('actor_key', user.actorKey)
    .order('acquired_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    items: data ?? [],
    persisted: true
  });
}

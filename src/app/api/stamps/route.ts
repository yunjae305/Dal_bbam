import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/backend/auth/current-user';
import { createSupabaseServerClient } from '@/backend/supabase/server';

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  if (!user.supabaseUserId) {
    return NextResponse.json({
      items: [],
      persisted: false,
      message: 'Supabase 인증 사용자일 때 스탬프 현황이 저장됩니다.'
    });
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ items: [], persisted: false });
  }

  const { data, error } = await supabase
    .from('stamps')
    .select('id, acquired_at, lat, lng, places(id, content_id, name, category, image_url)')
    .eq('user_id', user.supabaseUserId)
    .order('acquired_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    items: data ?? [],
    persisted: true
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/backend/supabase/server';

// GET /api/schedules
export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { data, error } = await supabase
    .from('schedules')
    .select('*, schedule_places(*, places(*))')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

// POST /api/schedules
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json();
  const { title, start_date, end_date } = body;

  if (!title) return NextResponse.json({ error: 'title 필요' }, { status: 400 });

  const { data, error } = await supabase
    .from('schedules')
    .insert({ user_id: user.id, title, start_date, end_date })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

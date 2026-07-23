import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/backend/supabase/server';

// GET /api/courses/:id
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 });

  const { id } = await params;

  const { data, error } = await supabase
    .from('courses')
    .select('*, course_places(order_index, places(*))')
    .eq('id', id)
    .single();

  if (error || !data) return NextResponse.json({ error: '코스를 찾을 수 없습니다.' }, { status: 404 });
  return NextResponse.json({ item: data });
}

// PATCH /api/courses/:id
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { title, description } = body;

  const { data, error } = await supabase
    .from('courses')
    .update({ title, description })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error || !data) return NextResponse.json({ error: '코스를 찾을 수 없습니다.' }, { status: 404 });
  return NextResponse.json(data);
}

// DELETE /api/courses/:id
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { id } = await params;

  const { error } = await supabase.from('courses').delete().eq('id', id).eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}

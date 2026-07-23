import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/backend/supabase/server';

// GET /api/cart
export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { data, error } = await supabase
    .from('cart_items')
    .select('*, places(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

// POST /api/cart
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json();
  const { place_id } = body;

  if (!place_id) return NextResponse.json({ error: 'place_id 필요' }, { status: 400 });

  const { data, error } = await supabase
    .from('cart_items')
    .insert({ user_id: user.id, place_id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// DELETE /api/cart?id=xxx
export async function DELETE(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  const { error } = await supabase.from('cart_items').delete().eq('id', id).eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}

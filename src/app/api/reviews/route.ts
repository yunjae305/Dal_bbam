import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/backend/supabase/server';

// GET /api/reviews?place_id=xxx
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 });

  const placeId = request.nextUrl.searchParams.get('place_id');

  const query = supabase
    .from('reviews')
    .select('*')
    .order('created_at', { ascending: false });

  if (placeId) query.eq('place_id', placeId);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

// POST /api/reviews
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 });

  const body = await request.json();
  const { user_id, place_id, content, rating, images } = body;

  if (!user_id || !content) return NextResponse.json({ error: 'user_id, content 필요' }, { status: 400 });
  if (rating && (rating < 1 || rating > 5)) return NextResponse.json({ error: '별점은 1~5 사이' }, { status: 400 });

  const { data, error } = await supabase
    .from('reviews')
    .insert({ user_id, place_id, content, rating, images: images ?? [] })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// DELETE /api/reviews?id=xxx
export async function DELETE(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  const { error } = await supabase.from('reviews').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}

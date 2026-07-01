import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/backend/supabase/server';

// GET /api/courses?user_id=xxx
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 });

  const userId = request.nextUrl.searchParams.get('user_id');

  const query = supabase
    .from('courses')
    .select('*, course_places(order_index, places(*))')
    .order('created_at', { ascending: false });

  if (userId) query.eq('user_id', userId);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

// POST /api/courses
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 });

  const body = await request.json();
  const { user_id, title, description, is_ai_generated, place_ids } = body;

  if (!title) return NextResponse.json({ error: 'title 필요' }, { status: 400 });

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .insert({ user_id, title, description, is_ai_generated: is_ai_generated ?? false })
    .select()
    .single();

  if (courseError) return NextResponse.json({ error: courseError.message }, { status: 500 });

  if (place_ids?.length) {
    const coursePlaces = place_ids.map((place_id: string, index: number) => ({
      course_id: course.id,
      place_id,
      order_index: index,
    }));
    const { error: placesError } = await supabase.from('course_places').insert(coursePlaces);
    if (placesError) return NextResponse.json({ error: placesError.message }, { status: 500 });
  }

  return NextResponse.json(course, { status: 201 });
}

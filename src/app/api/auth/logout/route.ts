import { createSupabaseServerClient } from '@/backend/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }

  return NextResponse.json({ success: true });
}

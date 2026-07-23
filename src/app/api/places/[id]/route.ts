import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '@/backend/supabase/env';
import type { Lang } from '@/shared/types';

function getLang(request: NextRequest): Lang {
  const lang = request.nextUrl.searchParams.get('lang');
  if (lang === 'en' || lang === 'ja' || lang === 'zh') return lang;
  return 'ko';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const lang = getLang(request);
  const env = getSupabaseEnv();

  if (!env.url || !env.serverKey) {
    return NextResponse.json({ error: 'Supabase가 설정되지 않았습니다.' }, { status: 503 });
  }

  const supabase = createClient(env.url, env.serverKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const query = supabase
    .from('places')
    .select('id, content_id, category, name, description, address, lat, lng, image_url, tags, ai_description_ko, ai_description_en, ai_description_zh, ai_description_ja, created_at');

  const { data, error } = await (isUuid
    ? query.or(`content_id.eq.${id},id.eq.${id}`)
    : query.eq('content_id', id)
  ).single();

  if (error || !data) {
    return NextResponse.json({ error: '관광지를 찾을 수 없습니다.' }, { status: 404 });
  }

  const row = data as {
    id: string;
    content_id: string | null;
    category: string | null;
    name: string | null;
    description: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    image_url: string | null;
    tags: string[] | null;
    ai_description_ko: string | null;
    ai_description_en: string | null;
    ai_description_zh: string | null;
    ai_description_ja: string | null;
  };

  const descriptionMap: Record<Lang, string | null> = {
    ko: row.ai_description_ko || row.description,
    en: row.ai_description_en || row.description,
    ja: row.ai_description_ja || row.description,
    zh: row.ai_description_zh || row.description,
  };

  const place = {
    id: row.content_id || row.id,
    category: row.category || '문화재',
    name: row.name || '경주 관광지',
    description: descriptionMap[lang] || '경주 관광 정보입니다.',
    address: row.address || '경주시',
    lat: row.lat,
    lng: row.lng,
    image: row.image_url || '/login-spring-bg.png',
    tags: row.tags ?? [],
    translations: {
      en: { description: row.ai_description_en || row.description || '' },
      ja: { description: row.ai_description_ja || row.description || '' },
      zh: { description: row.ai_description_zh || row.description || '' },
    }
  };

  return NextResponse.json({ item: place });
}

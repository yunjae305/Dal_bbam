import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// Each stop lists name patterns in preference order; the first synced place
// whose name matches is used. Resolve every stop before making any mutation.
export const curatedCourses = [
  {
    title: '신라 천년 역사 코스',
    theme: 'heritage',
    description: '불국사에서 첨성대까지, 유네스코 세계유산과 신라 왕경의 핵심을 하루에 둘러보는 정석 코스입니다.',
    transport: 'car',
    stops: [
      { patterns: ['불국사'], categories: ['heritage', 'attraction'], reason: '유네스코 세계유산, 신라 불교 예술의 정수', stayMinutes: 90 },
      { patterns: ['석굴암'], categories: ['heritage', 'attraction'], reason: '동해를 바라보는 석굴 사원', stayMinutes: 60 },
      { patterns: ['국립경주박물관'], categories: ['heritage', 'attraction'], reason: '신라 천년의 유물을 한자리에서', stayMinutes: 90 },
      { patterns: ['대릉원', '천마총'], categories: ['attraction', 'heritage'], reason: '고분 사이를 걷는 왕릉 산책', stayMinutes: 60 },
      { patterns: ['첨성대'], categories: ['attraction', 'heritage'], reason: '동양에서 가장 오래된 천문대', stayMinutes: 30 }
    ]
  },
  {
    title: '달빛 야경 산책 코스',
    theme: 'attraction',
    description: '해가 지면 시작되는 경주의 두 번째 얼굴. 달밤의 왕경을 걸어서 즐기는 야경 코스입니다.',
    transport: 'walking',
    stops: [
      { patterns: ['동궁과 월지', '동궁', '안압지'], categories: ['attraction', 'heritage'], reason: '연못에 비치는 야경의 백미', stayMinutes: 60 },
      { patterns: ['월정교'], categories: ['attraction', 'heritage'], reason: '조명이 켜진 다리 위 인생샷', stayMinutes: 30 },
      { patterns: ['첨성대'], categories: ['attraction', 'heritage'], reason: '밤하늘 아래 빛나는 천문대', stayMinutes: 30 },
      { patterns: ['황리단길'], categories: ['attraction'], reason: '야식과 소품샵으로 마무리', stayMinutes: 90 }
    ]
  },
  {
    title: '경주 미식 나들이 코스',
    theme: 'food',
    description: '교촌마을 한식부터 황리단길 디저트까지, 걸으며 맛보는 경주의 맛 코스입니다.',
    transport: 'walking',
    stops: [
      { patterns: ['교촌마을', '교촌'], categories: ['attraction', 'heritage', 'experience'], reason: '최부자댁과 전통 한식의 거리', stayMinutes: 90 },
      { patterns: ['월정교'], categories: ['attraction', 'heritage'], reason: '식후 소화를 위한 다리 산책', stayMinutes: 30 },
      { patterns: ['황리단길'], categories: ['attraction'], reason: '카페와 디저트, 기념품 골목', stayMinutes: 120 },
      { patterns: ['중앙시장'], categories: ['attraction', 'food'], reason: '경주 야시장 주전부리', stayMinutes: 60 }
    ]
  }
];

async function findPlace(db, patterns, categories) {
  for (const pattern of patterns) {
    const { data, error } = await db
      .from('places')
      .select('id, name, category')
      .ilike('name', `%${pattern}%`)
      .limit(20);
    if (error) throw Object.assign(new Error('seed_place_read_failed'), { code: error.code });
    if (!data?.length) continue;

    // Prefer the requested categories, then the most canonical (shortest) name
    // so "경주 첨성대" wins over lodging/food businesses that borrow the name.
    const preferred = categories?.length
      ? data.filter(row => categories.includes(row.category))
      : data;
    preferred.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id));
    if (preferred.length) return preferred[0];
  }
  return null;
}

export async function seedCuratedCourses({ db, url, secret, courses = curatedCourses, fetcher = fetch }) {
  const response = await fetcher(`${url.replace(/\/$/, '')}/rest/v1/`, {
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, Accept: 'application/openapi+json' },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('seed_schema_unverified');
  const schema = await response.json();
  if (!schema?.paths?.['/rpc/save_curated_course']?.post) throw new Error('seed_required_rpc_missing');

  const plans = [];
  for (const course of courses) {
    const { data: existing, error } = await db.from('courses').select('id, share_token').eq('is_curated', true).eq('title', course.title);
    if (error || !Array.isArray(existing)) throw new Error('seed_course_read_failed');
    if (existing.length > 1) throw new Error('seed_duplicate_course_title_requires_manual_resolution');
    const stops = [];
    for (const stop of course.stops) {
      const place = await findPlace(db, stop.patterns, stop.categories);
      if (!place) throw new Error('seed_required_place_missing');
      stops.push({ place_id: place.id, order_index: stops.length, reason: stop.reason, stay_minutes: stop.stayMinutes });
    }
    if (!stops.length || new Set(stops.map(stop => stop.place_id)).size !== stops.length) throw new Error('seed_duplicate_or_empty_stops');
    plans.push({ course, existing: existing[0] ?? null, stops });
  }

  const completed = [];
  for (const plan of plans) {
    // The RPC updates one existing header and its stops in one transaction.
    // Its UPDATE preserves the ID, share_token and existing metadata keys.
    const { data, error } = await db.rpc('save_curated_course', {
      p_id: plan.existing?.id ?? null,
      p_title: plan.course.title, p_description: plan.course.description,
      p_transport: plan.course.transport, p_theme: plan.course.theme,
      p_share_token: plan.existing ? plan.existing.share_token : randomUUID().replaceAll('-', ''),
      p_items: plan.stops
    });
    if (error || !data?.id) throw new Error('seed_atomic_course_save_failed');
    completed.push({ id: data.id, title: plan.course.title, updated: Boolean(plan.existing), stops: plan.stops.length });
  }
  return completed;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret) throw new Error('seed_database_not_configured');
  const db = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) }
  });
  const courses = await seedCuratedCourses({ db, url, secret });
  console.log(JSON.stringify({ created: courses.filter(course => !course.updated).length, updated: courses.filter(course => course.updated).length, courses }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    // Do not emit provider messages, connection URLs or stored row values.
    console.error(/^seed_[a-z_]+$/.test(error?.message) ? error.message : 'seed_request_failed');
    process.exitCode = 1;
  });
}

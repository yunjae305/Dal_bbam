import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY'];
for (const name of required) {
  if (!process.env[name]?.trim()) throw new Error(`${name} is required.`);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Each stop lists name patterns in preference order; the first synced place
// whose name matches is used. Stops with no match are skipped.
const curatedCourses = [
  {
    title: '신라 천년 역사 코스',
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

async function findPlace(patterns, categories) {
  for (const pattern of patterns) {
    const { data, error } = await supabase
      .from('places')
      .select('id, name, category')
      .ilike('name', `%${pattern}%`)
      .limit(20);
    if (error) throw error;
    if (!data?.length) continue;

    // Prefer the requested categories, then the most canonical (shortest) name
    // so "경주 첨성대" wins over lodging/food businesses that borrow the name.
    const preferred = categories?.length
      ? data.filter(row => categories.includes(row.category))
      : data;
    const candidates = preferred.length ? preferred : data;
    candidates.sort((a, b) => a.name.length - b.name.length);
    return candidates[0];
  }
  return null;
}

let created = 0;
for (const course of curatedCourses) {
  const resolvedStops = [];
  for (const stop of course.stops) {
    const place = await findPlace(stop.patterns);
    if (place) resolvedStops.push({ ...stop, place });
    else process.stdout.write(`  skip stop (no match): ${stop.patterns[0]} — ${course.title}\n`);
  }
  if (resolvedStops.length < 3) {
    process.stdout.write(`skip course (needs 3+ stops): ${course.title}\n`);
    continue;
  }

  // Re-runnable: replace an existing curated course with the same title.
  const { data: existing } = await supabase
    .from('courses')
    .select('id')
    .eq('is_curated', true)
    .eq('title', course.title);
  for (const row of existing ?? []) {
    await supabase.from('courses').delete().eq('id', row.id);
  }

  const { data: inserted, error: courseError } = await supabase
    .from('courses')
    .insert({
      actor_key: null,
      user_id: null,
      title: course.title,
      description: course.description,
      transport: course.transport,
      is_ai_generated: false,
      is_curated: true,
      share_token: randomUUID().replaceAll('-', ''),
      metadata: { seededBy: 'seed-curated-courses', seededAt: new Date().toISOString() }
    })
    .select('id')
    .single();
  if (courseError) throw courseError;

  const rows = resolvedStops.map((stop, index) => ({
    course_id: inserted.id,
    place_id: stop.place.id,
    order_no: index,
    order_index: index,
    reason: stop.reason,
    stay_minutes: stop.stayMinutes
  }));
  const { error: stopsError } = await supabase.from('course_places').insert(rows);
  if (stopsError) throw stopsError;

  created += 1;
  process.stdout.write(`seeded: ${course.title} (${rows.length} stops: ${resolvedStops.map(stop => stop.place.name).join(' → ')})\n`);
}

process.stdout.write(`Done. ${created} curated courses.\n`);

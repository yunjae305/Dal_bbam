/**
 * 관광지 이름을 영어·일본어·중국어로 채운다.
 *
 * TourAPI는 언어별로 서비스가 나뉘어 있고 contentId는 언어와 무관하게 같다. 상세 조회
 * (장소당 1회)가 아니라 목록 조회를 쓰기 때문에 언어당 수십 회 호출로 끝난다.
 *
 *   node --env-file=.env.local scripts/sync-place-translations.mjs          # 조회만
 *   node --env-file=.env.local scripts/sync-place-translations.mjs --apply  # place_translations 반영
 *
 * 키가 해당 언어 서비스에 등록돼 있지 않으면 그 언어만 건너뛰고 안내를 남긴다.
 */
import { createClient } from '@supabase/supabase-js';

for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'TOUR_API_KEY']) {
  if (!process.env[name]?.trim()) throw new Error(`${name} is required.`);
}

const services = { en: 'EngService2', ja: 'JpnService2', zh: 'ChsService2' };
const contentTypes = ['12', '14', '15', '28', '32', '38', '39'];
const PAGE_SIZE = 100;
const MAX_PAGES_PER_TYPE = 5;
const apply = process.argv.includes('--apply');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const serviceKey = process.env.TOUR_API_KEY.includes('%')
  ? process.env.TOUR_API_KEY
  : encodeURIComponent(process.env.TOUR_API_KEY);

function listUrl(service, contentTypeId, pageNo) {
  const params = new URLSearchParams({
    MobileOS: 'ETC', MobileApp: 'DalBbam', _type: 'json',
    mapX: '129.2247', mapY: '35.8562', radius: '30000', arrange: 'E',
    contentTypeId, numOfRows: String(PAGE_SIZE), pageNo: String(pageNo)
  });
  return `https://apis.data.go.kr/B551011/${service}/locationBasedList2?serviceKey=${serviceKey}&${params}`;
}

/** @returns {Promise<{ status: 'ok', rows: object[] } | { status: 'unregistered' | 'error', message?: string }>} */
async function fetchPage(service, contentTypeId, pageNo) {
  try {
    const response = await fetch(listUrl(service, contentTypeId, pageNo), { signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { return { status: 'error', message: text.slice(0, 120) }; }
    const gateway = payload?.OpenAPI_ServiceResponse?.cmmMsgHeader?.errMsg;
    if (gateway) return { status: 'unregistered', message: gateway };
    const item = payload?.response?.body?.items?.item ?? [];
    return { status: 'ok', rows: Array.isArray(item) ? item : [item] };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'unknown' };
  }
}

const places = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase.from('places').select('id, content_id, name').range(from, from + 999);
  if (error) throw error;
  places.push(...data);
  if (data.length < 1000) break;
}
const byContentId = new Map(places.map(place => [String(place.content_id), place]));
console.log(`DB 관광지 ${places.length}건`);

for (const [lang, service] of Object.entries(services)) {
  const titles = new Map();
  let calls = 0;
  let blocked = null;

  for (const contentTypeId of contentTypes) {
    for (let pageNo = 1; pageNo <= MAX_PAGES_PER_TYPE; pageNo += 1) {
      const result = await fetchPage(service, contentTypeId, pageNo);
      calls += 1;
      if (result.status === 'unregistered') { blocked = result.message; break; }
      if (result.status === 'error') break;
      for (const row of result.rows) {
        const title = String(row?.title ?? '').trim();
        if (row?.contentid && title) titles.set(String(row.contentid), title);
      }
      if (result.rows.length < PAGE_SIZE) break;
    }
    if (blocked) break;
  }

  if (blocked) {
    console.log(`\n[${lang}] ${service} 사용 불가 — ${blocked}`);
    console.log('  공공데이터포털에서 해당 언어 서비스를 활용신청해야 한다. 승인되면 같은 키로 동작한다.');
    continue;
  }

  const rows = [];
  for (const [contentId, title] of titles) {
    const place = byContentId.get(contentId);
    // 번역이 없으면 TourAPI가 한글 제목을 그대로 준다. 같은 값을 저장할 이유는 없다.
    if (place && title !== place.name) rows.push({ place_id: place.id, lang, name: title });
  }
  console.log(`\n[${lang}] 호출 ${calls}회 · 받은 제목 ${titles.size}건 · DB와 일치 ${rows.length}건`);
  console.log('  예시:', rows.slice(0, 3).map(row => `${byContentId.get([...titles.keys()].find(id => byContentId.get(id)?.id === row.place_id))?.name ?? ''} → ${row.name}`).join(' | ') || '(없음)');

  if (!apply) continue;
  for (let index = 0; index < rows.length; index += 200) {
    const batch = rows.slice(index, index + 200);
    const { error } = await supabase.from('place_translations').upsert(batch, { onConflict: 'place_id,lang' });
    if (error) throw error;
  }
  console.log(`  적용 완료: ${rows.length}건`);
}

if (!apply) console.log('\n(읽기 전용 실행 — 반영하려면 --apply)');

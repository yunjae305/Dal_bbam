import { createClient } from '@supabase/supabase-js';

const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'TOUR_API_KEY'];
for (const name of required) {
  if (!process.env[name]?.trim()) throw new Error(`${name} is required.`);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: class { constructor() { throw new Error('no realtime'); } } } }
);

const baseUrl = 'https://apis.data.go.kr/B551011/KorService2/locationBasedList2';
const contentTypes = ['12', '14', '15', '28', '32', '38', '39'];
const categoryByType = {
  12: 'attraction',
  14: 'heritage',
  15: 'festival',
  28: 'experience',
  32: 'lodging',
  38: 'attraction',
  39: 'food'
};

const MAX_PAGES_PER_TYPE = 5;
const PAGE_SIZE = 100;

function requestUrl(contentTypeId, pageNo) {
  const params = new URLSearchParams({
    MobileOS: 'ETC',
    MobileApp: 'DalBbam',
    _type: 'json',
    mapX: '129.2247',
    mapY: '35.8562',
    radius: '30000',
    arrange: 'E',
    contentTypeId,
    numOfRows: String(PAGE_SIZE),
    pageNo: String(pageNo)
  });
  const key = process.env.TOUR_API_KEY.includes('%')
    ? process.env.TOUR_API_KEY
    : encodeURIComponent(process.env.TOUR_API_KEY);
  return `${baseUrl}?serviceKey=${key}&${params}`;
}

async function fetchTypePage(contentTypeId, pageNo) {
  const response = await fetch(requestUrl(contentTypeId, pageNo), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`TourAPI ${contentTypeId} p${pageNo} failed: ${response.status}`);
  const payload = await response.json();
  const item = payload?.response?.body?.items?.item ?? [];
  return Array.isArray(item) ? item : [item];
}

const all = [];
for (const contentTypeId of contentTypes) {
  for (let pageNo = 1; pageNo <= MAX_PAGES_PER_TYPE; pageNo += 1) {
    const rows = await fetchTypePage(contentTypeId, pageNo);
    collectRows(rows, contentTypeId);
    if (rows.length < PAGE_SIZE) break;
  }
}

function collectRows(rows, contentTypeId) {
  for (const row of rows) {
    if (!row?.contentid || !row?.title) continue;
    const typeId = contentTypeId ?? (row.contenttypeid ? String(row.contenttypeid) : '12');
    all.push({
      content_id: String(row.contentid),
      content_type_id: typeId,
      category: categoryByType[typeId] ?? 'attraction',
      name: String(row.title),
      address: [row.addr1, row.addr2].filter(Boolean).join(' '),
      lat: Number(row.mapy) || null,
      lng: Number(row.mapx) || null,
      image_url: row.firstimage || row.firstimage2 || null,
      tags: [row.cat1, row.cat2, row.cat3].filter(Boolean).map(String),
      source: 'tour-api',
      source_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
}

// The location-based feed misses some flagship sights (ordering + page caps),
// so guarantee them with keyword lookups restricted to Gyeongju addresses.
const mustHaveKeywords = [
  '첨성대', '석굴암', '불국사', '대릉원', '동궁과 월지', '월정교',
  '국립경주박물관', '교촌마을', '황리단길', '분황사', '보문관광단지'
];

function keywordUrl(keyword) {
  const params = new URLSearchParams({
    MobileOS: 'ETC',
    MobileApp: 'DalBbam',
    _type: 'json',
    keyword,
    numOfRows: '10',
    pageNo: '1'
  });
  const key = process.env.TOUR_API_KEY.includes('%')
    ? process.env.TOUR_API_KEY
    : encodeURIComponent(process.env.TOUR_API_KEY);
  return `https://apis.data.go.kr/B551011/KorService2/searchKeyword2?serviceKey=${key}&${params}`;
}

for (const keyword of mustHaveKeywords) {
  const response = await fetch(keywordUrl(keyword), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) continue;
  const payload = await response.json();
  const item = payload?.response?.body?.items?.item ?? [];
  const rows = (Array.isArray(item) ? item : [item])
    .filter(row => String(row?.addr1 ?? '').includes('경주'));
  collectRows(rows, undefined);
}

const unique = [...new Map(all.map(row => [row.content_id, row])).values()];

// The list endpoints omit `overview`, so detailCommon2 is the only source for the
// grounding text that AI narration and pre-generation depend on.
const LANG_SERVICES = {
  ko: 'KorService2',
  en: 'EngService2',
  ja: 'JpnService2',
  zh: 'ChsService2'
};
const DETAIL_CONCURRENCY = 2;
const RATE_LIMIT_RETRIES = 4;
const RATE_LIMIT_ERROR = 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function detailUrl(service, contentId) {
  const params = new URLSearchParams({
    MobileOS: 'ETC',
    MobileApp: 'DalBbam',
    _type: 'json',
    contentId,
    numOfRows: '1',
    pageNo: '1'
  });
  const key = process.env.TOUR_API_KEY.includes('%')
    ? process.env.TOUR_API_KEY
    : encodeURIComponent(process.env.TOUR_API_KEY);
  return `https://apis.data.go.kr/B551011/${service}/detailCommon2?serviceKey=${key}&${params}`;
}

function stripHtml(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// TourAPI enforces a per-second request cap; back off instead of losing the row.
async function fetchDetail(service, contentId) {
  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt += 1) {
    try {
      const response = await fetch(detailUrl(service, contentId), { signal: AbortSignal.timeout(15000) });
      if (!response.ok) return null;
      const payload = await response.json();
      const errMsg = payload?.OpenAPI_ServiceResponse?.cmmMsgHeader?.errMsg;
      if (errMsg === RATE_LIMIT_ERROR) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      // Unregistered language services answer with OpenAPI_ServiceResponse instead.
      const items = payload?.response?.body?.items;
      if (!items) return null;
      const item = items.item ?? [];
      const row = Array.isArray(item) ? item[0] : item;
      return row ?? null;
    } catch {
      await sleep(500 * 2 ** attempt);
    }
  }
  return null;
}

async function mapWithConcurrency(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index], index);
    }
  }));
  return results;
}

const unregisteredServices = new Set();

async function fetchTranslations(contentId) {
  const entries = {};
  for (const [lang, service] of Object.entries(LANG_SERVICES)) {
    if (lang === 'ko' || unregisteredServices.has(service)) continue;
    const row = await fetchDetail(service, contentId);
    if (!row?.title) {
      // A language service that never answers is not enabled for this key; stop asking.
      unregisteredServices.add(service);
      continue;
    }
    entries[lang] = {
      name: String(row.title),
      overview: stripHtml(row.overview),
      description: stripHtml(row.overview).slice(0, 400)
    };
  }
  return entries;
}

const detailResults = await mapWithConcurrency(unique, DETAIL_CONCURRENCY, async row => {
  const korean = await fetchDetail(LANG_SERVICES.ko, row.content_id);
  if (korean) {
    row.overview = stripHtml(korean.overview) || null;
    row.description = row.overview ? row.overview.slice(0, 400) : null;
    row.phone = korean.tel ? String(korean.tel) : row.phone ?? null;
    row.homepage_url = stripHtml(korean.homepage) || row.homepage_url || null;
  }
  return { contentId: row.content_id, translations: await fetchTranslations(row.content_id) };
});

for (let index = 0; index < unique.length; index += 100) {
  const batch = unique.slice(index, index + 100);
  const { error } = await supabase.from('places').upsert(batch, { onConflict: 'content_id' });
  if (error) throw error;
}

// place_translations references places(id), so ids are only known after the upsert.
const { data: storedPlaces, error: storedError } = await supabase
  .from('places')
  .select('id, content_id');
if (storedError) throw storedError;
const placeIdByContentId = new Map((storedPlaces ?? []).map(place => [String(place.content_id), place.id]));

const translationRows = [];
for (const result of detailResults) {
  const placeId = placeIdByContentId.get(String(result.contentId));
  if (!placeId) continue;
  for (const [lang, value] of Object.entries(result.translations)) {
    translationRows.push({
      place_id: placeId,
      lang,
      name: value.name,
      description: value.description || null,
      overview: value.overview || null,
      updated_at: new Date().toISOString()
    });
  }
}

for (let index = 0; index < translationRows.length; index += 100) {
  const batch = translationRows.slice(index, index + 100);
  const { error } = await supabase
    .from('place_translations')
    .upsert(batch, { onConflict: 'place_id,lang' });
  if (error) throw error;
}

const withOverview = unique.filter(row => row.overview).length;
process.stdout.write(`Synced ${unique.length} Gyeongju places (${withOverview} with overview).\n`);
process.stdout.write(`Stored ${translationRows.length} translations.\n`);
if (unregisteredServices.size > 0) {
  process.stdout.write(
    `Skipped language services (not enabled for this TOUR_API_KEY): ${[...unregisteredServices].join(', ')}\n`
  );
}

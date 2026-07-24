import { createClient } from '@supabase/supabase-js';

const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'TOUR_API_KEY'];
for (const name of required) {
  if (!process.env[name]?.trim()) throw new Error(`${name} is required.`);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
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

function requestUrl(contentTypeId) {
  const params = new URLSearchParams({
    MobileOS: 'ETC',
    MobileApp: 'DalBbam',
    _type: 'json',
    mapX: '129.2247',
    mapY: '35.8562',
    radius: '30000',
    arrange: 'E',
    contentTypeId,
    numOfRows: '100',
    pageNo: '1'
  });
  const key = process.env.TOUR_API_KEY.includes('%')
    ? process.env.TOUR_API_KEY
    : encodeURIComponent(process.env.TOUR_API_KEY);
  return `${baseUrl}?serviceKey=${key}&${params}`;
}

const all = [];
for (const contentTypeId of contentTypes) {
  const response = await fetch(requestUrl(contentTypeId), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`TourAPI ${contentTypeId} failed: ${response.status}`);
  const payload = await response.json();
  const item = payload?.response?.body?.items?.item ?? [];
  const rows = Array.isArray(item) ? item : [item];
  for (const row of rows) {
    if (!row?.contentid || !row?.title) continue;
    all.push({
      content_id: String(row.contentid),
      content_type_id: contentTypeId,
      category: categoryByType[contentTypeId] ?? 'attraction',
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

const unique = [...new Map(all.map(row => [row.content_id, row])).values()];
for (let index = 0; index < unique.length; index += 100) {
  const batch = unique.slice(index, index + 100);
  const { error } = await supabase.from('places').upsert(batch, { onConflict: 'content_id' });
  if (error) throw error;
}

process.stdout.write(`Synced ${unique.length} Gyeongju places.\n`);

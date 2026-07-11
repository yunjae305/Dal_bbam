// TourAPI에서 경주 관광지 데이터를 가져와서 Supabase places 테이블에 넣는 스크립트
// 실행: node scripts/seed-places.mjs

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    process.env[key] ??= valueParts.join('=');
  }
}

loadEnvLocal();

const TOUR_API_KEY = process.env.TOUR_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

// contentTypeId → 카테고리 매핑
const CATEGORY_MAP = {
  '12': '문화재',  // 관광지
  '14': '문화재',  // 문화시설
  '15': '축제',    // 축제/공연/행사
  '32': '숙박',    // 숙박
  '39': '음식점',  // 음식점
};

// TourAPI에서 경주 관광지 가져오기
async function fetchPlacesFromTourAPI(contentTypeId, numOfRows = 30) {
  // serviceKey는 URLSearchParams 없이 직접 붙여야 이중인코딩 방지됨
  const params = new URLSearchParams({
    mapX: '129.2247',
    mapY: '35.8562',
    radius: '30000',
    contentTypeId,
    numOfRows: String(numOfRows),
    pageNo: '1',
    MobileOS: 'ETC',
    MobileApp: 'DalBbam',
    _type: 'json',
    arrange: 'E',
  });

  const url = `https://apis.data.go.kr/B551011/KorService2/locationBasedList2?serviceKey=${TOUR_API_KEY}&${params}`;
  console.log(`  TourAPI 호출 중... (contentTypeId: ${contentTypeId})`);

  const res = await fetch(url);
  const json = await res.json();

  const items = json?.response?.body?.items?.item;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

// Supabase에 데이터 삽입
async function insertToSupabase(places) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/places`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=ignore-duplicates',  // 중복 무시
    },
    body: JSON.stringify(places),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('  Supabase 오류:', err);
    return false;
  }
  return true;
}

async function main() {
  console.log('=== 경주 관광지 seed 데이터 구축 시작 ===\n');

  if (!TOUR_API_KEY) {
    throw new Error('TOUR_API_KEY가 필요합니다.');
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL과 서버 전용 SUPABASE_SECRET_KEY가 필요합니다.');
  }

  const contentTypes = ['12', '14', '15', '32', '39'];
  let totalInserted = 0;

  for (const typeId of contentTypes) {
    const items = await fetchPlacesFromTourAPI(typeId);
    console.log(`  ${CATEGORY_MAP[typeId]} (${typeId}): ${items.length}개 가져옴`);

    if (items.length === 0) continue;

    // Supabase places 테이블 형식에 맞게 변환
    const places = items
      .filter(item => item.mapy && item.mapx)  // 좌표 없는 것 제외
      .map(item => ({
        content_id: item.contentid,
        category: CATEGORY_MAP[typeId] || '문화재',
        name: item.title,
        description: item.overview || null,
        address: item.addr1 || null,
        lat: parseFloat(item.mapy),
        lng: parseFloat(item.mapx),
        image_url: item.firstimage || item.firstimage2 || null,
        tags: [],
      }));

    if (places.length === 0) continue;

    const ok = await insertToSupabase(places);
    if (ok) {
      console.log(`  ✅ ${places.length}개 삽입 완료`);
      totalInserted += places.length;
    }
  }

  console.log(`\n=== 완료: 총 ${totalInserted}개 관광지 저장됨 ===`);
}

main().catch(console.error);

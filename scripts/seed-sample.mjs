// 샘플 데이터를 Supabase places 테이블에 넣는 스크립트
// 실행: node scripts/seed-sample.mjs

const SUPABASE_URL = 'https://shhkzgnojismtswvkujf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoaGt6Z25vamlzbXRzd3ZrdWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTI3NTcsImV4cCI6MjA5ODQ2ODc1N30.xrrQbe3pA2XPQHTClBo6c6bvAa-oVtHYxVoSzIiA_Eo';

const samplePlaces = [
  {
    content_id: 'donggung-wolji',
    category: '문화재',
    name: '동궁과 월지',
    description: '신라 왕궁의 별궁 터와 연못 야경을 함께 볼 수 있는 경주 대표 문화재입니다.',
    address: '경주시 원화로 102',
    lat: 35.8347,
    lng: 129.2266,
    image_url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Water_reflection_of_Donggung_Palace_in_Wolji_Pond_at_blue_hour_in_Gyeongju_South_Korea.jpg',
    tags: ['야경', '문화재', '사진'],
  },
  {
    content_id: 'bulguksa',
    category: '문화재',
    name: '불국사',
    description: '유네스코 세계문화유산으로 석가탑과 다보탑을 만나는 신라 불교문화의 상징입니다.',
    address: '경주시 불국로 385',
    lat: 35.7901,
    lng: 129.332,
    image_url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Bulguksa%20temple%20entrance%20gate%20stairs%20flower%20bed%20and%20blue%20sky%20in%20Gyeongju%20South%20Korea.jpg',
    tags: ['세계유산', '사찰', '역사'],
  },
  {
    content_id: 'hwangnidan',
    category: '음식점',
    name: '황리단길 로컬 맛집',
    description: '한옥 골목을 따라 지역 디저트, 한식, 카페를 한 번에 탐색할 수 있는 거리입니다.',
    address: '경주시 포석로 일대',
    lat: 35.8378,
    lng: 129.2112,
    image_url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Hwangnidan-gil%2001.jpg',
    tags: ['맛집', '카페', '골목'],
  },
  {
    content_id: 'bomun-stay',
    category: '숙박',
    name: '보문 관광단지',
    description: '호수 산책과 리조트 숙박을 연결해 가족 여행 동선을 편하게 만들 수 있는 권역입니다.',
    address: '경주시 보문로 일대',
    lat: 35.8451,
    lng: 129.2894,
    image_url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Bomun%20Lake%20from%20Gyeongju%20World.jpg',
    tags: ['숙박', '호수', '가족'],
  },
  {
    content_id: 'silla-festival',
    category: '축제',
    name: '신라문화제',
    description: '신라 역사와 공연, 체험 콘텐츠를 결합한 경주 대표 축제입니다.',
    address: '경주 시내 일원',
    lat: 35.8562,
    lng: 129.2247,
    image_url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Silla%20cultural%20festival%20street%20parade%20-%201.jpg',
    tags: ['축제', '공연', '체험'],
  },
];

async function main() {
  console.log('=== 샘플 데이터 Supabase 삽입 시작 ===\n');

  const res = await fetch(`${SUPABASE_URL}/rest/v1/places`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=ignore-duplicates',
    },
    body: JSON.stringify(samplePlaces),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('오류:', err);
    return;
  }

  console.log(`✅ ${samplePlaces.length}개 관광지 삽입 완료!`);
  console.log('Supabase Table Editor에서 places 테이블 확인해봐요.');
}

main().catch(console.error);

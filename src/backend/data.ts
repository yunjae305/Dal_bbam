import type { Lang, MvpData, Place } from '@/shared/types';

export const mvpData: MvpData = {
  overview: {
    name: 'AI와 함께하는 경주 역사 여행',
    headline: '짧게 보고 바로 걷는 경주',
    summary: '관광공사 OpenAPI로 확장할 데이터를 Route Handler에서 제공하고, 모바일 PWA에서 검색, 추천, 쇼츠 해설을 바로 실행합니다.',
    region: '경상북도 경주시',
    mvpFeatures: [
      '관광 데이터 탐색',
      'AI 맞춤 코스 추천',
      '1분 쇼츠형 다국어 해설'
    ],
    stack: [
      'TypeScript',
      'Next.js App Router',
      'React',
      'Tailwind CSS',
      'Supabase ready',
      'Route Handler',
      'PWA'
    ]
  },
  places: [
    {
      id: 'donggung-wolji',
      category: '문화재',
      name: '동궁과 월지',
      description: '신라 왕궁의 별궁 터와 연못 야경을 함께 볼 수 있는 경주 대표 문화재입니다.',
      address: '경주시 원화로 102',
      distance: '1.2km',
      rating: 4.8,
      bestTime: '19:00 추천',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Water_reflection_of_Donggung_Palace_in_Wolji_Pond_at_blue_hour_in_Gyeongju_South_Korea.jpg',
      tags: ['야경', '문화재', '사진'],
      coordinates: [35.8347, 129.2266],
      translations: {
        en: {
          name: 'Donggung Palace and Wolji Pond',
          description: 'A Silla palace garden site known for night views reflected on the pond.'
        },
        ja: {
          name: '東宮と月池',
          description: '池に映る夜景が美しい新羅王宮の別宮跡です。'
        },
        zh: {
          name: '东宫与月池',
          description: '以池面夜景倒影闻名的新罗王宫别宫遗址。'
        }
      }
    },
    {
      id: 'bulguksa',
      category: '문화재',
      name: '불국사',
      description: '유네스코 세계문화유산으로 석가탑과 다보탑을 만나는 신라 불교문화의 상징입니다.',
      address: '경주시 불국로 385',
      distance: '13.8km',
      rating: 4.9,
      bestTime: '09:00 추천',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Bulguksa%20temple%20entrance%20gate%20stairs%20flower%20bed%20and%20blue%20sky%20in%20Gyeongju%20South%20Korea.jpg',
      tags: ['세계유산', '사찰', '역사'],
      coordinates: [35.7901, 129.332],
      translations: {
        en: {
          name: 'Bulguksa Temple',
          description: 'A UNESCO World Heritage temple that represents Silla Buddhist culture.'
        },
        ja: {
          name: '仏国寺',
          description: '新羅仏教文化を代表するユネスコ世界文化遺産の寺院です。'
        },
        zh: {
          name: '佛国寺',
          description: '代表新罗佛教文化的联合国教科文组织世界文化遗产寺院。'
        }
      }
    },
    {
      id: 'hwangnidan',
      category: '음식점',
      name: '황리단길 로컬 맛집',
      description: '한옥 골목을 따라 지역 디저트, 한식, 카페를 한 번에 탐색할 수 있는 거리입니다.',
      address: '경주시 포석로 일대',
      distance: '900m',
      rating: 4.6,
      bestTime: '12:30 추천',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Hwangnidan-gil%2001.jpg',
      tags: ['맛집', '카페', '골목'],
      coordinates: [35.8378, 129.2112],
      translations: {
        en: {
          name: 'Hwangnidan-gil Local Food Street',
          description: 'A hanok alley filled with local desserts, Korean meals, and cafes.'
        },
        ja: {
          name: 'ファンリダンギル ローカルグルメ',
          description: '韓屋の路地で地域スイーツ、韓食、カフェを楽しめる通りです。'
        },
        zh: {
          name: '皇理团路本地美食街',
          description: '可在韩屋街巷中探索当地甜点、韩餐和咖啡馆。'
        }
      }
    },
    {
      id: 'bomun-stay',
      category: '숙박',
      name: '보문 관광단지 숙박',
      description: '호수 산책과 리조트 숙박을 연결해 가족 여행 동선을 편하게 만들 수 있는 권역입니다.',
      address: '경주시 보문로 일대',
      distance: '6.4km',
      rating: 4.5,
      bestTime: '체크인 15:00',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Bomun%20Lake%20from%20Gyeongju%20World.jpg',
      tags: ['숙박', '호수', '가족'],
      coordinates: [35.8451, 129.2894],
      translations: {
        en: {
          name: 'Bomun Tourist Complex Stay',
          description: 'A lakeside resort area that makes family routes and stays easier.'
        },
        ja: {
          name: '普門観光団地 宿泊',
          description: '湖の散策とリゾート滞在を組み合わせやすいエリアです。'
        },
        zh: {
          name: '普门旅游区住宿',
          description: '连接湖边散步与度假住宿的家庭旅行区域。'
        }
      }
    },
    {
      id: 'silla-festival',
      category: '축제',
      name: '신라문화제',
      description: '신라 역사와 공연, 체험 콘텐츠를 결합한 경주 대표 축제입니다.',
      address: '경주 시내 일원',
      distance: '1.6km',
      rating: 4.7,
      bestTime: '가을 시즌',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Silla%20cultural%20festival%20street%20parade%20-%201.jpg',
      tags: ['축제', '공연', '체험'],
      coordinates: [35.8562, 129.2247],
      translations: {
        en: {
          name: 'Silla Culture Festival',
          description: 'Gyeongju festival combining Silla history, performances, and hands-on experiences.'
        },
        ja: {
          name: '新羅文化祭',
          description: '新羅の歴史、公演, 体験を組み合わせた慶州代表祭りです。'
        },
        zh: {
          name: '新罗文化节',
          description: '结合新罗历史、演出和体验内容的庆州代表庆典。'
        }
      }
    }
  ],
  courses: [
    {
      id: 'first-visit',
      persona: '외국인 첫 방문',
      title: '처음 만나는 천년 경주',
      description: '다국어 설명이 잘 맞는 대표 문화재와 음식 거리를 짧은 이동으로 연결합니다.',
      duration: '당일 7시간',
      transport: '도보+셔틀',
      stops: ['대릉원', '첨성대', '황리단길', '동궁과 월지'],
      focus: ['다국어', '대표 명소', '야경']
    },
    {
      id: 'history-deep',
      persona: '역사 몰입',
      title: '신라 왕경 깊이 보기',
      description: '문화재 설명 쇼츠를 먼저 보고 현장에서 흐름을 따라 걷는 코스입니다.',
      duration: '1박 2일',
      transport: '차량 추천',
      stops: ['불국사', '석굴암', '국립경주박물관', '월정교'],
      focus: ['세계유산', '박물관', '쇼츠']
    },
    {
      id: 'family-easy',
      persona: '가족 여행',
      title: '쉬운 이동 가족 코스',
      description: '숙박, 음식점, 체험을 한 흐름으로 묶어 이동 피로를 낮춘 일정입니다.',
      duration: '2박 3일',
      transport: '차량+도보',
      stops: ['보문 관광단지', '동궁원', '황리단길', '신라문화제'],
      focus: ['숙박', '체험', '음식']
    }
  ],
  shorts: [
    {
      id: 'wolji-night',
      placeId: 'donggung-wolji',
      title: '연못에 비친 신라의 밤',
      caption: '현장에서 보기 전 1분으로 이해하는 동궁과 월지의 야경 포인트',
      duration: '00:58',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Water_reflection_of_Donggung_Palace_in_Wolji_Pond_at_blue_hour_in_Gyeongju_South_Korea.jpg',
      tags: ['야경', '문화재', '신라']
    },
    {
      id: 'bulguksa-stone',
      placeId: 'bulguksa',
      title: '석가탑과 다보탑을 구분하는 법',
      caption: '외국인 관광객도 쉽게 이해하는 불국사 핵심 구조',
      duration: '01:00',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Bulguksa%20temple%20entrance%20gate%20stairs%20flower%20bed%20and%20blue%20sky%20in%20Gyeongju%20South%20Korea.jpg',
      tags: ['세계유산', '불교문화', 'AI해설']
    },
    {
      id: 'hwangnidan-food',
      placeId: 'hwangnidan',
      title: '황리단길에서 점심 고르는 순서',
      caption: '혼잡 시간과 동선을 고려한 음식점 탐색 가이드',
      duration: '00:45',
      image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Hwangnidan-gil%2002.jpg',
      tags: ['맛집', '동선', '추천']
    }
  ]
};

export function getLocalizedPlaces(lang: Lang): Place[] {
  return mvpData.places.map(place => {
    if (lang === 'ko') {
      return place;
    }

    return {
      ...place,
      name: place.translations[lang].name,
      description: place.translations[lang].description
    };
  });
}

export function getMvpData(lang: Lang = 'ko'): MvpData {
  return {
    ...mvpData,
    places: getLocalizedPlaces(lang)
  };
}

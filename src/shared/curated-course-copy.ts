import type { Lang } from '@/shared/types';

type Translation = { title: string; description: string; reasons: Record<string, string> };

/**
 * The three seeded curated courses (scripts/seed-curated-courses.mjs) are stored in Korean
 * only, so English, Japanese and Chinese visitors read them in Korean. Their wording is
 * fixed, so translations live here, keyed by the Korean text. Courses an admin writes later
 * have no entry and stay as written.
 */
const copy: Record<string, Partial<Record<Exclude<Lang, 'ko'>, Translation>>> = {
  '신라 천년 역사 코스': {
    en: {
      title: 'Thousand Years of Silla',
      description: 'From Bulguksa to Cheomseongdae: the essential day through UNESCO World Heritage and the heart of the Silla capital.',
      reasons: {
        '유네스코 세계유산, 신라 불교 예술의 정수': 'UNESCO World Heritage, the height of Silla Buddhist art',
        '동해를 바라보는 석굴 사원': 'A grotto temple facing the East Sea',
        '신라 천년의 유물을 한자리에서': 'A thousand years of Silla treasures in one place',
        '고분 사이를 걷는 왕릉 산책': 'A walk among the royal tombs',
        '동양에서 가장 오래된 천문대': 'The oldest surviving observatory in East Asia'
      }
    },
    ja: {
      title: '新羅千年の歴史コース',
      description: '仏国寺から瞻星台まで、ユネスコ世界遺産と新羅王京の要所を一日で巡る定番コースです。',
      reasons: {
        '유네스코 세계유산, 신라 불교 예술의 정수': 'ユネスコ世界遺産、新羅仏教美術の粋',
        '동해를 바라보는 석굴 사원': '東海を望む石窟寺院',
        '신라 천년의 유물을 한자리에서': '新羅千年の遺物が一堂に',
        '고분 사이를 걷는 왕릉 산책': '古墳の間を歩く王陵散策',
        '동양에서 가장 오래된 천문대': '東洋最古の天文台'
      }
    },
    zh: {
      title: '新罗千年历史路线',
      description: '从佛国寺到瞻星台，一天游遍联合国教科文组织世界遗产与新罗王京的精华。',
      reasons: {
        '유네스코 세계유산, 신라 불교 예술의 정수': '联合国教科文组织世界遗产，新罗佛教艺术的精髓',
        '동해를 바라보는 석굴 사원': '面向东海的石窟寺院',
        '신라 천년의 유물을 한자리에서': '一站看尽新罗千年文物',
        '고분 사이를 걷는 왕릉 산책': '漫步于古坟之间的王陵散步',
        '동양에서 가장 오래된 천문대': '东方现存最古老的天文台'
      }
    }
  },
  '달빛 야경 산책 코스': {
    en: {
      title: 'Moonlit Night Walk',
      description: "Gyeongju's second face appears after sunset: a walking tour of the royal capital by moonlight.",
      reasons: {
        '연못에 비치는 야경의 백미': 'The finest night view, mirrored in the pond',
        '조명이 켜진 다리 위 인생샷': 'Photos on the lantern-lit bridge',
        '밤하늘 아래 빛나는 천문대': 'The observatory glowing under the night sky',
        '야식과 소품샵으로 마무리': 'Finish with late-night snacks and small shops'
      }
    },
    ja: {
      title: '月明かりの夜景散策コース',
      description: '日が暮れると現れる慶州のもう一つの顔。月夜の王京を歩いて楽しむ夜景コースです。',
      reasons: {
        '연못에 비치는 야경의 백미': '池に映る夜景の白眉',
        '조명이 켜진 다리 위 인생샷': 'ライトアップされた橋の上で記念写真',
        '밤하늘 아래 빛나는 천문대': '夜空の下で輝く天文台',
        '야식과 소품샵으로 마무리': '夜食と雑貨店で締めくくり'
      }
    },
    zh: {
      title: '月光夜景漫步路线',
      description: '日落后展现的庆州另一面。步行欣赏月夜王京的夜景路线。',
      reasons: {
        '연못에 비치는 야경의 백미': '倒映在池中的最美夜景',
        '조명이 켜진 다리 위 인생샷': '在灯光点亮的桥上拍照',
        '밤하늘 아래 빛나는 천문대': '夜空下闪耀的天文台',
        '야식과 소품샵으로 마무리': '以夜宵和小店收尾'
      }
    }
  },
  '경주 미식 나들이 코스': {
    en: {
      title: 'Gyeongju Food Stroll',
      description: 'From Korean dishes in Gyochon Village to desserts on Hwangnidan-gil, a walking taste of Gyeongju.',
      reasons: {
        '최부자댁과 전통 한식의 거리': "The Choi family house and a street of traditional Korean food",
        '식후 소화를 위한 다리 산책': 'A bridge walk to settle the meal',
        '카페와 디저트, 기념품 골목': 'Cafés, desserts and souvenir alleys',
        '경주 야시장 주전부리': 'Snacks at the Gyeongju night market'
      }
    },
    ja: {
      title: '慶州グルメ散策コース',
      description: '校村村の韓定食から皇理団通りのデザートまで、歩いて味わう慶州の味コースです。',
      reasons: {
        '최부자댁과 전통 한식의 거리': '崔富者宅と伝統韓食の通り',
        '식후 소화를 위한 다리 산책': '食後の腹ごなしに橋を散歩',
        '카페와 디저트, 기념품 골목': 'カフェとデザート、お土産の路地',
        '경주 야시장 주전부리': '慶州夜市の食べ歩き'
      }
    },
    zh: {
      title: '庆州美食漫游路线',
      description: '从校村村的韩式料理到皇理团路的甜点，边走边品尝庆州的味道。',
      reasons: {
        '최부자댁과 전통 한식의 거리': '崔富者宅与传统韩食街',
        '식후 소화를 위한 다리 산책': '饭后散步消食的桥',
        '카페와 디저트, 기념품 골목': '咖啡馆、甜点与纪念品小巷',
        '경주 야시장 주전부리': '庆州夜市小吃'
      }
    }
  }
};

type CuratedLike = {
  title: string;
  description?: string | null;
  course_places?: Array<{ reason?: string | null }> | null;
};

/** Returns the course in the visitor's language when a translation exists, unchanged otherwise. */
export function localizeCuratedCourse<T extends CuratedLike>(course: T, lang: Lang): T {
  if (lang === 'ko') return course;
  const translation = copy[course.title]?.[lang];
  if (!translation) return course;
  return {
    ...course,
    title: translation.title,
    description: translation.description,
    course_places: course.course_places?.map(stop => ({
      ...stop,
      reason: stop.reason ? translation.reasons[stop.reason] ?? stop.reason : stop.reason
    })) ?? course.course_places
  };
}

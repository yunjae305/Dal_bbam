import type { Lang, PlaceCategory } from '@/shared/types';

export const stampThemeIds = ['history', 'food', 'nature'] as const;
export type StampThemeId = (typeof stampThemeIds)[number];

export type StampTheme = {
  id: StampThemeId;
  categories: PlaceCategory[];
  name: Record<Lang, string>;
  description: Record<Lang, string>;
};

export const stampThemes: StampTheme[] = [
  {
    id: 'history',
    // TourAPI files 첨성대·대릉원·월정교 as 관광지 (attraction), and stamp-seed.ts picks the
    // history landmarks from heritage and attraction alike. Matching only heritage left
    // those landmarks outside every course.
    categories: ['heritage', 'attraction'],
    name: { ko: '역사 코스', en: 'History route', ja: '歴史コース', zh: '历史路线' },
    description: {
      ko: '신라 천년의 문화유산을 따라 걷는 코스',
      en: 'Walk through a thousand years of Silla heritage.',
      ja: '新羅千年の文化遺産をめぐるコース',
      zh: '沿着新罗千年文化遗产漫步的路线'
    }
  },
  {
    id: 'food',
    categories: ['food'],
    name: { ko: '미식 코스', en: 'Food route', ja: 'グルメコース', zh: '美食路线' },
    description: {
      ko: '경주의 맛집을 찾아다니는 미식 코스',
      en: 'Taste your way through Gyeongju.',
      ja: '慶州の名店を訪ねるグルメコース',
      zh: '寻访庆州美食的路线'
    }
  },
  {
    id: 'nature',
    categories: ['nature', 'experience'],
    name: { ko: '자연 코스', en: 'Nature route', ja: '自然コース', zh: '自然路线' },
    description: {
      ko: '자연과 체험을 즐기는 힐링 코스',
      en: 'Relax with nature and hands-on experiences.',
      ja: '自然と体験を楽しむ癒しのコース',
      zh: '享受自然与体验的治愈路线'
    }
  }
];

export type StampThemeProgress = {
  theme: StampTheme;
  total: number;
  acquired: number;
  completed: boolean;
};

/**
 * Groups stamp target places into themed bundles and computes per-theme
 * progress. Themes with no matching places are omitted so the UI never
 * renders an empty 0/0 course.
 */
export function getStampThemeProgress(
  places: Array<{ contentId: string; category: PlaceCategory }>,
  acquiredContentIds: ReadonlySet<string>
): StampThemeProgress[] {
  return stampThemes
    .map(theme => {
      const themePlaces = places.filter(place => theme.categories.includes(place.category));
      const acquired = themePlaces.filter(place => acquiredContentIds.has(place.contentId)).length;
      return {
        theme,
        total: themePlaces.length,
        acquired,
        completed: themePlaces.length > 0 && acquired === themePlaces.length
      };
    })
    .filter(progress => progress.total > 0);
}

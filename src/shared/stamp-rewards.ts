import type { Lang } from '@/shared/types';

const titles = {
  'stamp-first-visit': {
    en: ['First Moonlight Traveler', 'A traveler title earned with your first verified stamp.'],
    ja: ['初めての月夜の旅人', '最初の現地スタンプで獲得する旅人の称号。'],
    zh: ['初访月夜旅人', '获得首枚实地认证印章的旅人称号。']
  },
  'stamp-three-places': {
    en: ['Silla Trail Explorer', 'A traveler title earned by visiting three different places.'],
    ja: ['新羅の道の探検家', '異なる3か所を訪れて獲得する旅人の称号。'],
    zh: ['新罗之路探索者', '到访三个不同景点后获得的旅人称号。']
  },
  'stamp-seven-places': {
    en: ['Gyeongju Moonlight Master', 'A traveler title earned by collecting seven Gyeongju stamps.'],
    ja: ['慶州月夜マスター', '慶州のスタンプ7個を集めて獲得する旅人の称号。'],
    zh: ['庆州月夜大师', '集齐七枚庆州印章后获得的旅人称号。']
  }
} as const;

/** Translate built-in titles; custom administrator reward text is preserved. */
export function localizeStampReward<T extends { code: string; title: string; description: string }>(reward: T, lang: Lang): T {
  if (lang === 'ko' || !Object.prototype.hasOwnProperty.call(titles, reward.code)) return reward;
  const [title, description] = titles[reward.code as keyof typeof titles][lang];
  return { ...reward, title, description };
}

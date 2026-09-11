import { describe, expect, it } from 'vitest';
import { defaultStampContentIds } from './stamp-seed';
import { getStampThemeProgress } from './stamp-themes';
import type { PlaceCategory } from './types';

const place = (content_id: string, name: string, category: PlaceCategory, lat: number | null = 35.85, lng: number | null = 129.2) => ({ content_id, name, category, lat, lng });

describe('default stamp catalogue seed', () => {
  it('includes history plus at most two food and two nature places in stable name order', () => {
    const places = [place('h1', '첨성대', 'heritage'), place('h2', '불국사', 'heritage'),
      place('f3', '다 식당', 'food'), place('f1', '가 식당', 'food'), place('f2', '나 식당', 'food'),
      place('n2', '나 숲', 'nature'), place('n3', '다 숲', 'nature'), place('n1', '가 숲', 'nature')];
    const ids = defaultStampContentIds(places);
    expect(ids).toEqual(['h1', 'h2', 'f1', 'f2', 'n1', 'n2']);
    expect(defaultStampContentIds([...places].reverse())).toEqual(ids);
    const targets = places.filter(item => ids.includes(item.content_id)).map(item => ({ contentId: item.content_id, category: item.category }));
    expect(getStampThemeProgress(targets, new Set()).map(item => item.theme.id)).toEqual(['history', 'food', 'nature']);
  });

  it('never seeds missing coordinates, out-of-service places, or invented stops', () => {
    const ids = defaultStampContentIds([place('h', '첨성대', 'heritage'), place('bad', '가 식당', 'food', null, null), place('far', '서울 숲', 'nature', 37.5, 127)]);
    expect(ids).toEqual(['h']);
    expect(defaultStampContentIds([])).toEqual([]);
  });

  it('prefers TourAPI rows over leftover sample slugs with the same landmark', () => {
    const ids = defaultStampContentIds([
      place('bulguksa', '불국사', 'heritage', 35.7901, 129.332),
      place('126166', '경주 불국사 [유네스코 세계유산]', 'attraction', 35.7899, 129.3319),
      place('donggung-wolji', '동궁과 월지', 'heritage', 35.8347, 129.2266),
      place('128526', '경주 동궁과 월지', 'attraction', 35.8349, 129.2267)
    ]);
    expect(ids).toEqual(['126166', '128526']);
  });

  it('uses real heritage fallbacks when named landmarks are absent', () => {
    expect(defaultStampContentIds([place('h2', '나 유적', 'heritage'), place('h1', '가 유적', 'heritage')])).toEqual(['h1', 'h2']);
  });
});

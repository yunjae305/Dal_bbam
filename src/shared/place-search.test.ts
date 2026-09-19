import { describe, expect, it } from 'vitest';
import { sortPlacesByRelevance } from './place-search';

const kakao = (name: string) => ({ name, kakaoPlaceId: `kakao-${name}` });

describe('map search relevance', () => {
  it('puts the attraction the app can open ahead of Kakao businesses sharing the keyword', () => {
    const ranked = sortPlacesByRelevance([
      kakao('강산불국사지게차'),
      kakao('불국사문화회관'),
      { name: '불국사한옥동오당' },
      { name: '경주 불국사 [유네스코 세계유산]' },
      { name: '경주 블리스커피', description: '불국사 가는 길의 카페' }
    ], '불국사');
    expect(ranked.map(place => place.name)).toEqual([
      '경주 불국사 [유네스코 세계유산]', '불국사한옥동오당', '불국사문화회관', '강산불국사지게차', '경주 블리스커피'
    ]);
  });

  it('keeps the given order when nothing was typed', () => {
    const places = [kakao('second'), { name: 'first' }];
    expect(sortPlacesByRelevance(places, '  ')).toBe(places);
  });
});

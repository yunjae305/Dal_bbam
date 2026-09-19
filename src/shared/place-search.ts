/**
 * Ranking for the map list, which mixes the app's own TourAPI attractions with
 * Kakao keyword results. Kakao returns any business whose name contains the
 * keyword, so searching "불국사" used to surface a forklift dealer before the
 * temple. Attractions the app can open a detail page for come first, and within
 * each group the closest name match wins.
 */
export type SearchablePlace = {
  name: string;
  description?: string;
  address?: string;
  tags?: string[];
  /** Present only on Kakao keyword results, which have no in-app detail page. */
  kakaoPlaceId?: string;
};

/**
 * A name that carries the keyword as its own word is the landmark the visitor
 * means: "경주 불국사 [유네스코 세계유산]" beats "불국사한옥동오당" for "불국사".
 */
function nameTier(name: string, query: string): number {
  if (name === query) return 0;
  if (name.split(/[\s[\]()·,~\-–—/]+/).filter(Boolean).includes(query)) return 1;
  if (name.startsWith(query)) return 2;
  if (name.includes(query)) return 3;
  return 4;
}

/** Lower is better. Name matches rank above places that only match elsewhere. */
export function placeMatchRank(place: SearchablePlace, query: string): [number, number] {
  const tier = nameTier(place.name.toLowerCase(), query);
  const fromKakao = place.kakaoPlaceId ? 1 : 0;
  // The last tier means the name did not match at all: those trail every name match.
  return [(tier === 4 ? 2 : 0) + fromKakao, tier];
}

export function sortPlacesByRelevance<T extends SearchablePlace>(places: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return places;
  return places
    .map((place, index) => ({ place, index, rank: placeMatchRank(place, needle) }))
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.index - b.index)
    .map(entry => entry.place);
}

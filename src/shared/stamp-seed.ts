import { withoutSampleSlugs } from './tour-content-id';

type StampSeedPlace = {
  content_id: string;
  name: string;
  category: string;
  lat: number | null;
  lng: number | null;
};

/** Gyeongju's flagship history stops. Shared with the course planner so both agree on them. */
export const gyeongjuLandmarkNames = ['첨성대', '불국사', '대릉원', '동궁과 월지', '월정교', '국립경주박물관', '교촌마을'];
const landmarkNames = gyeongjuLandmarkNames;

/** Picks a small, repeatable catalogue from real synced places with usable GPS. */
export function defaultStampContentIds(places: StampSeedPlace[]): string[] {
  // Sample slug rows' exact names ("불국사") beat TourAPI's own ("경주 불국사 [유네스코 세계유산]"),
  // which pointed stamps at sample pages.
  const valid = withoutSampleSlugs(places, place => place.content_id).filter(place => Boolean(place.content_id) && Number.isFinite(place.lat) && Number.isFinite(place.lng) &&
    Number(place.lat) >= 35.65 && Number(place.lat) <= 36.12 && Number(place.lng) >= 128.95 && Number(place.lng) <= 129.58)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.content_id.localeCompare(b.content_id));
  const history = landmarkNames.flatMap(name => {
    const candidates = valid.filter(item => item.category === 'heritage' || item.category === 'attraction');
    const place = candidates.find(item => item.name === name) ?? candidates.find(item => item.name.includes(name));
    return place ? [place.content_id] : [];
  });
  const result = [
    ...(history.length ? history : valid.filter(place => place.category === 'heritage').slice(0, 2).map(place => place.content_id)),
    ...valid.filter(place => place.category === 'food').slice(0, 2).map(place => place.content_id),
    ...valid.filter(place => place.category === 'nature').slice(0, 2).map(place => place.content_id)
  ];
  return [...new Set(result)];
}

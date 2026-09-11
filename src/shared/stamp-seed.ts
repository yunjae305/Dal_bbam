type StampSeedPlace = {
  content_id: string;
  name: string;
  category: string;
  lat: number | null;
  lng: number | null;
};

const landmarkNames = ['첨성대', '불국사', '대릉원', '동궁과 월지', '월정교', '국립경주박물관', '교촌마을'];

/** Picks a small, repeatable catalogue from real synced places with usable GPS. */
export function defaultStampContentIds(places: StampSeedPlace[]): string[] {
  const valid = places.filter(place => Boolean(place.content_id) && Number.isFinite(place.lat) && Number.isFinite(place.lng) &&
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

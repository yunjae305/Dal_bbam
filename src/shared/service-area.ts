export type GeoPoint = { lat: number; lng: number };
export type GeoBounds = { south: number; west: number; north: number; east: number };

// A deliberately conservative service box around Gyeongju. It is wider than
// the administrative boundary so routes near the city edge keep working while
// arbitrary nationwide requests cannot consume the server-side Kakao quota.
export const GYEONGJU_SERVICE_BOUNDS: GeoBounds = Object.freeze({
  south: 35.55,
  west: 128.85,
  north: 36.15,
  east: 129.65
});

export const GYEONGJU_CENTER: GeoPoint = Object.freeze({
  lat: 35.8562,
  lng: 129.2247
});

/** Shared by the server routes and the map screen, which must agree on what "in Gyeongju" means. */
export function isInGyeongjuServiceArea(point: GeoPoint): boolean {
  return point.lat >= GYEONGJU_SERVICE_BOUNDS.south
    && point.lat <= GYEONGJU_SERVICE_BOUNDS.north
    && point.lng >= GYEONGJU_SERVICE_BOUNDS.west
    && point.lng <= GYEONGJU_SERVICE_BOUNDS.east;
}

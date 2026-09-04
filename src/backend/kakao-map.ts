import type { NextRequest } from 'next/server';

export type GeoPoint = { lat: number; lng: number };
export type GeoBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

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

export function isInGyeongjuServiceArea(point: GeoPoint): boolean {
  return point.lat >= GYEONGJU_SERVICE_BOUNDS.south
    && point.lat <= GYEONGJU_SERVICE_BOUNDS.north
    && point.lng >= GYEONGJU_SERVICE_BOUNDS.west
    && point.lng <= GYEONGJU_SERVICE_BOUNDS.east;
}

export function intersectGyeongjuBounds(bounds: GeoBounds): GeoBounds | null {
  const intersection = {
    south: Math.max(bounds.south, GYEONGJU_SERVICE_BOUNDS.south),
    west: Math.max(bounds.west, GYEONGJU_SERVICE_BOUNDS.west),
    north: Math.min(bounds.north, GYEONGJU_SERVICE_BOUNDS.north),
    east: Math.min(bounds.east, GYEONGJU_SERVICE_BOUNDS.east)
  };

  return intersection.south < intersection.north && intersection.west < intersection.east
    ? intersection
    : null;
}

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

function requestIdentity(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown';
}

export function checkMapApiRateLimit(
  request: NextRequest,
  scope: string,
  limit: number,
  windowMs = 60_000
): boolean {
  if (process.env.NODE_ENV === 'test' && process.env.MAP_API_RATE_LIMIT_DISABLED === 'true') {
    return true;
  }

  const now = Date.now();
  const key = `${scope}:${requestIdentity(request)}`;
  const existing = rateBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
  } else if (existing.count >= limit) {
    return false;
  } else {
    existing.count += 1;
  }

  if (rateBuckets.size > 2_000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
    }
  }

  return true;
}

export class TimedCache<T> {
  private readonly values = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 250
  ) {}

  get(key: string): T | null {
    const entry = this.values.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.values.size >= this.maxEntries) {
      const first = this.values.keys().next().value as string | undefined;
      if (first) this.values.delete(first);
    }
    this.values.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.values.clear();
  }
}

export function configuredKakaoMapOrigins(): string[] {
  return (process.env.KAKAO_MAP_JS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .flatMap(value => {
      try {
        return [new URL(value).origin];
      } catch {
        return [];
      }
    });
}

export function configuredFrontendOrigin(): string | null {
  const value = process.env.FRONTEND_URL?.trim();
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

import { validRouteMetric } from '../src/shared/directions.ts';

// Public landmarks only: Cheomseongdae → Bulguksa. Never send a user's GPS fix.
export async function verifyKakaoRoutes({ key, fetcher = fetch } = {}) {
  const entries = await Promise.all(['walking', 'public', 'bicycle', 'car'].map(async mode => {
    if (!key?.trim()) return [mode, { operational: false, reason: 'not_configured' }];
    const endpoint = { walking: 'walk', public: 'publictraffic', bicycle: 'bicycle' }[mode];
    const url = mode === 'car'
      ? new URL('https://apis-navi.kakaomobility.com/v1/directions?origin=129.2191,35.8347&destination=129.332,35.7901&priority=RECOMMEND')
      : new URL(`https://dapi.kakao.com/v2/routing/${endpoint}?start_x=129.2191&start_y=35.8347&end_x=129.332&end_y=35.7901`);
    try {
      const response = await fetcher(url, { headers: { Authorization: `KakaoAK ${key.trim()}` }, signal: AbortSignal.timeout(8000), cache: 'no-store' });
      if (!response.ok) return [mode, { operational: false, reason: `HTTP_${response.status}` }];
      const body = await response.json();
      const route = mode === 'car' ? body.routes?.find(item => item.result_code === 0)?.summary
        : body.status === 'OK' ? mode === 'public' ? body.routes?.[0]?.properties : body.route?.properties : null;
      const distanceMeters = mode === 'car' ? route?.distance : route?.totalDistance;
      const durationSeconds = mode === 'car' ? route?.duration : route?.totalTime;
      if (!validRouteMetric(distanceMeters) || !validRouteMetric(durationSeconds)) return [mode, { operational: false, reason: 'NO_VALID_ROUTE' }];
      return [mode, { operational: true, distanceMeters, durationSeconds }];
    } catch (error) {
      const code = error?.cause?.code ?? error?.code ?? error?.name;
      return [mode, { operational: false, reason: typeof code === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(code) ? code : 'PROVIDER_ERROR' }];
    }
  }));
  return Object.fromEntries(entries);
}

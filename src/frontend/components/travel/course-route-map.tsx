'use client';

import { useEffect, useRef, useState } from 'react';
import type { CoursePlan } from '@/shared/types';
import { useLocale } from '@/frontend/i18n/locale-context';
import { plannerMessages } from '@/shared/planner-messages';

// Reuse the existing SDK script when the map screen has already loaded it.
async function loadMaps() {
  if (!window.kakao?.maps) {
    const key = process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY;
    if (!key) throw new Error('unavailable');
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-kakao-map-sdk]');
      const script = existing ?? document.createElement('script');
      const timeout = window.setTimeout(() => reject(new Error('unavailable')), 8_000);
      script.addEventListener('load', () => { window.clearTimeout(timeout); resolve(); }, { once: true });
      script.addEventListener('error', () => { window.clearTimeout(timeout); reject(new Error('unavailable')); }, { once: true });
      if (!existing) {
        script.dataset.kakaoMapSdk = 'true';
        script.async = true;
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false&libraries=clusterer`;
        document.head.appendChild(script);
      }
    });
  }
  await new Promise<void>((resolve, reject) => {
    if (!window.kakao?.maps) { reject(new Error('unavailable')); return; }
    window.kakao.maps.load(resolve);
  });
}

export function CourseRouteMap({ plan }: { plan: CoursePlan }) {
  const { locale } = useLocale();
  const ui = plannerMessages[locale];
  const container = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    const overlays: Array<{ setMap: (map: null) => void }> = [];
    void loadMaps().then(() => {
      if (!active || !container.current || !window.kakao?.maps) return;
      const maps = window.kakao.maps;
      const first = plan.stops.find(stop => stop.place)?.place;
      if (!first) return;
      const map = new maps.Map(container.current, { center: new maps.LatLng(...first.coordinates), level: 6 });
      const bounds = new maps.LatLngBounds();
      for (const stop of plan.stops) {
        if (!stop.place) continue;
        const position = new maps.LatLng(...stop.place.coordinates);
        bounds.extend(position);
        overlays.push(new maps.Marker({ map, position, title: `${stop.order + 1}. ${stop.place.name}` }));
        if (stop.travelPath?.length) {
          const line = new maps.Polyline({ path: stop.travelPath.map(point => new maps.LatLng(...point)), strokeWeight: 4, strokeColor: ['#223c72', '#2f7567', '#dc6a42'][(stop.dayIndex ?? 0) % 3], strokeOpacity: 0.85, strokeStyle: plan.timingSource === 'map-provider' ? 'solid' : 'shortdash' });
          line.setMap(map); overlays.push(line);
          stop.travelPath.forEach(point => bounds.extend(new maps.LatLng(...point)));
        }
      }
      map.setBounds(bounds);
    }).catch(() => { if (active) setUnavailable(true); });
    return () => { active = false; overlays.forEach(overlay => overlay.setMap(null)); };
  }, [plan]);
  return <div className="mt-4 overflow-hidden rounded-xl bg-[#eef0f3]">
    {!unavailable && <div ref={container} aria-label={ui.map} role="region" className="h-64 w-full" />}
    <div className="space-y-2 p-3">
      {unavailable && <p className="text-[10px] leading-5">{ui.mapUnavailable}</p>}
      {plan.stops.map((stop, index) => {
        const previous = plan.stops[index - 1];
        if (!previous?.place || !stop.place || stop.dayIndex !== previous.dayIndex) return null;
        const from = `${encodeURIComponent(previous.place.name)},${previous.place.coordinates.join(',')}`;
        const to = `${encodeURIComponent(stop.place.name)},${stop.place.coordinates.join(',')}`;
        const mode = { walking: 'walk', car: 'car', public: 'traffic' }[plan.transport];
        return <a key={stop.contentId} href={`https://map.kakao.com/link/by/${mode}/${from}/${to}`} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-between gap-2 rounded-lg bg-white px-3 text-[10px] font-bold"><span>{previous.place.name} → {stop.place.name}</span><span className="shrink-0 tabular-nums">{ui.transfer.replace('{minutes}', String(stop.travelMinutes ?? 0))} ↗</span></a>;
      })}
    </div>
  </div>;
}

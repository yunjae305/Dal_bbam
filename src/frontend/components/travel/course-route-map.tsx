'use client';

import { useEffect, useRef, useState } from 'react';
import type { CoursePlan } from '@/shared/types';
import { useLocale } from '@/frontend/i18n/locale-context';
import { plannerMessages } from '@/shared/planner-messages';
import { loadKakaoMaps } from '@/frontend/kakao-sdk';
import { formatDistance } from '@/shared/format-distance';

export function CourseRouteMap({ plan }: { plan: CoursePlan }) {
  const { locale } = useLocale();
  const ui = plannerMessages[locale];
  const container = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    const overlays: Array<{ setMap: (map: null) => void }> = [];
    void loadKakaoMaps().then(() => {
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
          const providerPath = stop.travelPathSource ? stop.travelPathSource === 'provider' : (stop.travelSource ?? plan.timingSource) === 'map-provider';
          const line = new maps.Polyline({ path: stop.travelPath.map(point => new maps.LatLng(...point)), strokeWeight: 4, strokeColor: ['#223c72', '#2f7567', '#dc6a42'][(stop.dayIndex ?? 0) % 3], strokeOpacity: 0.85, strokeStyle: providerPath ? 'solid' : 'shortdash' });
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
        const estimate = (stop.travelSource ?? plan.timingSource) !== 'map-provider';
        return <a key={stop.contentId} href={`https://map.kakao.com/link/by/${mode}/${from}/${to}`} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-between gap-2 rounded-lg bg-white px-3 text-xs font-bold"><span>{previous.place.name} → {stop.place.name}</span><span className="shrink-0 tabular-nums">{estimate ? '≈ ' : ''}{typeof stop.distanceMeters === 'number' ? `${formatDistance(stop.distanceMeters)} · ` : ''}{ui.transfer.replace('{minutes}', String(stop.travelMinutes ?? 0))} ↗</span></a>;
      })}
    </div>
  </div>;
}

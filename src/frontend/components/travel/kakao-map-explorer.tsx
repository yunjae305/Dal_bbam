'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, MapPin, Navigation, ShieldCheck, X } from 'lucide-react';
import type { Place } from '@/shared/types';
import { MapPattern } from '@/frontend/components/common/ui';
import { useLocale } from '@/frontend/i18n/locale-context';
import { readLocationConsent, saveLocationConsent } from '@/frontend/location-consent';

declare global {
  interface Window {
    kakao?: { maps: Record<string, any> & { load: (callback: () => void) => void } };
  }
}

type Coordinates = { lat: number; lng: number; accuracy?: number };
type DirectionData = {
  path: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  source: string;
  externalUrl: string;
  disclaimer?: string;
};

let mapsLoader: Promise<void> | null = null;

function loadKakaoMaps(): Promise<void> {
  if (window.kakao?.maps) {
    return new Promise(resolve => window.kakao?.maps.load(resolve));
  }
  if (mapsLoader) return mapsLoader;

  mapsLoader = new Promise((resolve, reject) => {
    const key = process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY;
    if (!key) {
      reject(new Error('Kakao map JavaScript key is not configured.'));
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-kakao-map-sdk]');
    if (existing) {
      existing.addEventListener('load', () => window.kakao?.maps.load(resolve), { once: true });
      existing.addEventListener('error', () => reject(new Error('Kakao Maps SDK failed to load.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.dataset.kakaoMapSdk = 'true';
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false&libraries=clusterer`;
    script.onload = () => window.kakao?.maps.load(resolve);
    script.onerror = () => reject(new Error('Kakao Maps SDK failed to load.'));
    document.head.appendChild(script);
  });

  return mapsLoader;
}

export function KakaoMapExplorer({
  places,
  selectedPlace,
  onSelect,
  onNearbyPlaces,
  onNearbyLoading
}: {
  places: Place[];
  selectedPlace?: Place;
  onSelect: (place: Place) => void;
  onNearbyPlaces?: (places: Place[]) => void;
  onNearbyLoading?: (loading: boolean) => void;
}) {
  const { messages } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const onSelectRef = useRef(onSelect);
  const polylineRef = useRef<any>(null);
  const locationMarkerRef = useRef<any>(null);
  const [mapAvailable, setMapAvailable] = useState(true);
  const [consent, setConsent] = useState<boolean | null | 'unknown'>('unknown');
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState('');
  const [directions, setDirections] = useState<DirectionData | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    readLocationConsent()
      .then(setConsent)
      .catch(() => setConsent(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadKakaoMaps().then(() => {
      if (cancelled || !containerRef.current || !window.kakao?.maps) return;
      const maps = window.kakao.maps;
      const center = selectedPlace?.coordinates ?? [35.8562, 129.2247];
      const map = new maps.Map(containerRef.current, {
        center: new maps.LatLng(center[0], center[1]),
        level: 7
      });
      mapRef.current = map;

      const markers = places.map(place => {
        const marker = new maps.Marker({
          position: new maps.LatLng(place.coordinates[0], place.coordinates[1]),
          title: place.name
        });
        maps.event.addListener(marker, 'click', () => onSelectRef.current(place));
        return marker;
      });

      if (maps.MarkerClusterer) {
        new maps.MarkerClusterer({
          map,
          averageCenter: true,
          minLevel: 6,
          markers
        });
      } else {
        markers.forEach(marker => marker.setMap(map));
      }
      setMapAvailable(true);
    }).catch(() => {
      if (!cancelled) setMapAvailable(false);
    });

    return () => {
      cancelled = true;
      mapRef.current = null;
    };
  }, [places]);

  useEffect(() => {
    const maps = window.kakao?.maps;
    const map = mapRef.current;
    if (!maps || !map || !selectedPlace) return;
    map.panTo(new maps.LatLng(selectedPlace.coordinates[0], selectedPlace.coordinates[1]));
  }, [selectedPlace]);

  const recordConsent = useCallback(async (granted: boolean) => {
    setConsent(granted);
    try {
      await saveLocationConsent(granted);
    } catch (error) {
      setConsent(null);
      throw error;
    }
  }, []);

  const loadNearby = useCallback(async (coordinates: Coordinates) => {
    onNearbyLoading?.(true);
    try {
      const params = new URLSearchParams({
        mapX: String(coordinates.lng),
        mapY: String(coordinates.lat),
        radius: '3000',
        numOfRows: '20'
      });
      const response = await fetch(`/api/tour/nearby?${params}`, { cache: 'no-store' });
      const payload = await response.json() as { places?: Place[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? '주변 관광지를 불러오지 못했습니다.');
      onNearbyPlaces?.(payload.places ?? []);
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : '주변 관광지를 불러오지 못했습니다.');
    } finally {
      onNearbyLoading?.(false);
    }
  }, [onNearbyLoading, onNearbyPlaces]);

  const requestLocation = useCallback(async (grantFromConsentDialog = false) => {
    setLocationError('');
    if (consent !== true && !grantFromConsentDialog) {
      setConsent(null);
      return;
    }
    if (grantFromConsentDialog) {
      try {
        await recordConsent(true);
      } catch (error) {
        setLocationError(error instanceof Error ? error.message : '위치정보 동의를 저장하지 못했습니다.');
        return;
      }
    }
    if (!navigator.geolocation) {
      setLocationError('이 브라우저는 위치정보를 지원하지 않습니다.');
      return;
    }

    navigator.geolocation.getCurrentPosition(position => {
      const next = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      };
      setLocation(next);
      void loadNearby(next);
      const maps = window.kakao?.maps;
      const map = mapRef.current;
      if (maps && map) {
        locationMarkerRef.current?.setMap(null);
        locationMarkerRef.current = new maps.Marker({
          map,
          position: new maps.LatLng(next.lat, next.lng),
          title: messages.map.currentLocation
        });
        map.panTo(new maps.LatLng(next.lat, next.lng));
      }
    }, error => {
      setLocationError(error.code === error.PERMISSION_DENIED
        ? '위치 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용하거나 수동 탐색을 이용해 주세요.'
        : '현재 위치를 확인할 수 없습니다.');
    }, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000
    });
  }, [consent, loadNearby, messages.map.currentLocation, recordConsent]);

  async function loadDirections(mode: 'car' | 'walking') {
    if (!selectedPlace) return;
    const origin = location ?? { lat: 35.8562, lng: 129.2247 };
    const params = new URLSearchParams({
      originLat: String(origin.lat),
      originLng: String(origin.lng),
      destinationLat: String(selectedPlace.coordinates[0]),
      destinationLng: String(selectedPlace.coordinates[1]),
      destinationName: selectedPlace.name,
      mode
    });
    setRouteLoading(true);
    try {
      const response = await fetch(`/api/maps/directions?${params}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? '길찾기를 불러오지 못했습니다.');
      const next = payload.data as DirectionData;
      setDirections(next);

      const maps = window.kakao?.maps;
      const map = mapRef.current;
      if (maps && map && next.path.length) {
        polylineRef.current?.setMap(null);
        polylineRef.current = new maps.Polyline({
          path: next.path.map(([lat, lng]) => new maps.LatLng(lat, lng)),
          strokeWeight: 5,
          strokeColor: '#b94f4a',
          strokeOpacity: 0.85,
          strokeStyle: 'solid'
        });
        polylineRef.current.setMap(map);
        const bounds = new maps.LatLngBounds();
        next.path.forEach(([lat, lng]) => bounds.extend(new maps.LatLng(lat, lng)));
        map.setBounds(bounds);
      }
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : '길찾기를 불러오지 못했습니다.');
    } finally {
      setRouteLoading(false);
    }
  }

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#e8f0e3]">
      {!mapAvailable && <MapPattern />}
      <div ref={containerRef} className={`h-full w-full ${mapAvailable ? '' : 'hidden'}`} aria-label={messages.map.title} />

      {consent === null && (
        <div className="absolute inset-x-4 top-36 z-30 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-black/10">
          <button
            type="button"
            aria-label={messages.common.close}
            className="absolute right-3 top-3 text-[#7b817f]"
            onClick={() => void recordConsent(false).catch(() => setConsent(null))}
          >
            <X size={18} />
          </button>
          <ShieldCheck className="text-[#2f7567]" size={24} />
          <h2 className="mt-2 text-sm font-black">{messages.map.consentTitle}</h2>
          <p className="mt-1 pr-4 text-[11px] leading-5 text-[#616a67]">{messages.map.consentBody}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void requestLocation(true)} className="rounded-full bg-[#2f7567] px-4 py-2 text-[11px] font-black text-white">
              {messages.map.allow}
            </button>
            <button type="button" onClick={() => void recordConsent(false).catch(() => setConsent(null))} className="rounded-full bg-[#eef1ef] px-4 py-2 text-[11px] font-black">
              {messages.map.decline}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => void requestLocation()}
        className="absolute bottom-48 right-4 z-20 grid h-10 w-10 place-items-center rounded-full bg-white text-[#2f7567] shadow-lg"
        aria-label={messages.map.currentLocation}
      >
        <Crosshair size={19} />
      </button>

      {selectedPlace && (
        <div className="absolute bottom-[84px] left-4 right-4 z-20 rounded-2xl bg-white/95 p-3 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black">{selectedPlace.name}</p>
              <p className="truncate text-[10px] text-[#68716e]">{selectedPlace.address}</p>
            </div>
            <MapPin size={22} className="shrink-0 text-[#b94f4a]" />
          </div>
          <div className="mt-2 flex gap-2">
            <button disabled={routeLoading} type="button" onClick={() => loadDirections('walking')} className="rounded-full bg-[#eef3ee] px-3 py-1.5 text-[10px] font-black disabled:opacity-50">
              {messages.map.walkingEstimate}
            </button>
            <button disabled={routeLoading} type="button" onClick={() => loadDirections('car')} className="rounded-full bg-[#b94f4a] px-3 py-1.5 text-[10px] font-black text-white disabled:opacity-50">
              {messages.map.carRoute}
            </button>
          </div>
          {directions && (
            <div className="mt-2 flex items-center justify-between gap-3 text-[10px]">
              <span>{(directions.distanceMeters / 1000).toFixed(1)}km · {Math.max(1, Math.round(directions.durationSeconds / 60))}분</span>
              <a className="inline-flex items-center gap-1 font-black text-[#2f7567]" href={directions.externalUrl} target="_blank" rel="noreferrer">
                <Navigation size={12} /> {messages.map.directions}
              </a>
            </div>
          )}
          {(locationError || directions?.disclaimer) && (
            <p className="mt-2 text-[9px] leading-4 text-[#a04c48]">{locationError || directions?.disclaimer}</p>
          )}
        </div>
      )}
    </div>
  );
}

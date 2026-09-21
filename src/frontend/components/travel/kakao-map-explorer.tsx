'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Bike,
  Bus,
  Car,
  ChevronDown,
  ChevronUp,
  Crosshair,
  ExternalLink,
  Footprints,
  MapPin,
  Minus,
  Navigation,
  Plus,
  RotateCw,
  Search,
  ShieldCheck,
  X
} from 'lucide-react';
import type { Place } from '@/shared/types';
import {
  directionModes,
  isFallbackDirection,
  type DirectionComparison,
  type DirectionMode,
  type DirectionResult
} from '@/shared/directions';
import { MapPattern } from '@/frontend/components/common/ui';
import { useLocale } from '@/frontend/i18n/locale-context';
import { acquirePosition, GeolocationAcquireError } from '@/frontend/geolocation';
import { readLocationConsent, saveLocationConsent } from '@/frontend/location-consent';
import { formatDistance } from '@/shared/format-distance';
import { isInGyeongjuServiceArea } from '@/shared/service-area';
import { loadKakaoMaps } from '@/frontend/kakao-sdk';

type KakaoLatLng = object;
type KakaoLatLngPoint = {
  getLat: () => number;
  getLng: () => number;
};
type KakaoLatLngBounds = {
  extend: (position: KakaoLatLng) => void;
};
type KakaoMap = {
  panTo: (position: KakaoLatLng) => void;
  setBounds: (bounds: KakaoLatLngBounds) => void;
  setLevel: (level: number, options?: { animate?: boolean }) => void;
  getLevel: () => number;
  getBounds: () => {
    getSouthWest: () => KakaoLatLngPoint;
    getNorthEast: () => KakaoLatLngPoint;
  };
};
type KakaoMarker = {
  setMap: (map: KakaoMap | null) => void;
};
type KakaoMarkerImage = object;
type KakaoMarkerClusterer = {
  clear?: () => void;
  setMap?: (map: KakaoMap | null) => void;
};
type KakaoPolyline = {
  setMap: (map: KakaoMap | null) => void;
};
type KakaoMouseEvent = { latLng?: KakaoLatLngPoint };
type KakaoMapsApi = {
  load: (callback: () => void) => void;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLng; level: number }
  ) => KakaoMap;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  Marker: new (options: {
    map?: KakaoMap;
    position: KakaoLatLng;
    title?: string;
    image?: KakaoMarkerImage;
    zIndex?: number;
  }) => KakaoMarker;
  MarkerImage?: new (
    src: string,
    size: object,
    options?: { offset?: object }
  ) => KakaoMarkerImage;
  Size?: new (width: number, height: number) => object;
  Point?: new (x: number, y: number) => object;
  MarkerClusterer?: new (options: {
    map: KakaoMap;
    averageCenter?: boolean;
    minLevel?: number;
    markers: KakaoMarker[];
  }) => KakaoMarkerClusterer;
  Polyline: new (options: {
    path: KakaoLatLng[];
    strokeWeight: number;
    strokeColor: string;
    strokeOpacity: number;
    strokeStyle: string;
  }) => KakaoPolyline;
  LatLngBounds: new () => KakaoLatLngBounds;
  event: {
    addListener: (target: object, type: string, listener: (event?: KakaoMouseEvent) => void) => void;
    removeListener: (target: object, type: string, listener: (event?: KakaoMouseEvent) => void) => void;
  };
};

declare global {
  interface Window {
    kakao?: { maps: KakaoMapsApi };
  }
}

export type MapBounds = { south: number; west: number; north: number; east: number };
export type MapPlace = Place & {
  kakaoPlaceId?: string;
  kakaoPlaceUrl?: string;
};
export type RoutePoint = {
  kind: 'current' | 'place' | 'map';
  lat: number;
  lng: number;
  name: string;
  contentId?: string;
};
type RouteEndpoint = 'origin' | 'destination';
type Coordinates = { lat: number; lng: number; accuracy?: number };

const ENDPOINT_MARKER_BASE = 'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/';

const modeIcons: Record<DirectionMode, typeof Car> = {
  car: Car,
  public: Bus,
  walking: Footprints,
  bicycle: Bike
};

/** Kakao results carry their own category wording; app places fall back to ours. */
function kakaoCategoryOf(place: MapPlace): string | null {
  return place.kakaoPlaceId ? place.tags.at(-1) ?? null : null;
}

function placePoint(place: MapPlace): RoutePoint {
  return {
    kind: 'place',
    lat: place.coordinates[0],
    lng: place.coordinates[1],
    name: place.name,
    contentId: place.contentId
  };
}

export function formatRouteDuration(
  seconds: number,
  templates: { durationHours: string; durationMinutes: string }
): string {
  const totalMinutes = seconds === 0 ? 0 : Math.max(1, Math.ceil(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0
    ? templates.durationHours.replace('{h}', String(hours)).replace('{m}', String(minutes))
    : templates.durationMinutes.replace('{m}', String(totalMinutes));
}

function pickDefaultMode(results: DirectionResult[]): DirectionMode | null {
  if (!results.length) return null;
  const preferred = results.filter(result => !isFallbackDirection(result));
  if (!preferred.length) return 'walking';
  const candidates = preferred;
  return candidates.reduce((best, item) => item.durationSeconds < best.durationSeconds ? item : best).mode;
}

export function KakaoMapExplorer({
  places,
  selectedPlace,
  onSelect,
  onNearbyPlaces,
  onNearbyLoading,
  onSearchArea,
  searchAreaLoading = false,
  bottomOffset = 84,
  routeOpen = false,
  onCloseRoute,
  onDismissPlace,
  onRouteViewChange
}: {
  places: MapPlace[];
  selectedPlace?: MapPlace;
  onSelect: (place: MapPlace) => void;
  onNearbyPlaces?: (places: Place[]) => void;
  onNearbyLoading?: (loading: boolean) => void;
  onSearchArea?: (bounds: MapBounds) => void | Promise<void>;
  searchAreaLoading?: boolean;
  /** Height of the sheet covering the map, so floating UI sits above it. */
  bottomOffset?: number;
  /** The route card is a mode of its own, like the map app's 길찾기 button. */
  routeOpen?: boolean;
  onCloseRoute?: () => void;
  onDismissPlace?: () => void;
  /** Lets the page hide its own search and list while the route screen is up. */
  onRouteViewChange?: (open: boolean) => void;
}) {
  const { locale, messages } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const selectedPlaceRef = useRef(selectedPlace);
  const pickingRef = useRef<RouteEndpoint | null>(null);
  const locationTargetRef = useRef<RouteEndpoint | null>(null);
  const locationAbortRef = useRef<AbortController | null>(null);
  const locationRevisionRef = useRef(0);
  const locateOnArrivalRef = useRef(false);
  const markersRef = useRef<Array<{ marker: KakaoMarker; click: () => void }>>([]);
  const clustererRef = useRef<KakaoMarkerClusterer | null>(null);
  const polylineRef = useRef<KakaoPolyline | null>(null);
  const locationMarkerRef = useRef<KakaoMarker | null>(null);
  const endpointMarkersRef = useRef<KakaoMarker[]>([]);
  const mapClickRef = useRef<{ map: KakaoMap; listener: (event?: KakaoMouseEvent) => void } | null>(null);
  const routeAbortRef = useRef<AbortController | null>(null);
  const routeRequestRef = useRef(0);
  const [mapAvailable, setMapAvailable] = useState(true);
  const [mapError, setMapError] = useState('');
  const [mapRetryToken, setMapRetryToken] = useState(0);
  const [mapGeneration, setMapGeneration] = useState(0);
  const [consent, setConsent] = useState<boolean | null | 'unknown'>('unknown');
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState('');
  const [origin, setOrigin] = useState<RoutePoint | null>(null);
  const [destination, setDestination] = useState<RoutePoint | null>(null);
  const [picking, setPicking] = useState<RouteEndpoint | null>(null);
  // GPS가 조용히 채운 출발지만으로는 길찾기 화면을 열지 않는다. 사용자가 직접 고른 경우만 연다.
  const [routeIntent, setRouteIntent] = useState(false);
  // 길찾기는 목록 화면으로 열고, 지도에서 보기를 누르면 접어서 지도를 보여 준다.
  const [routeExpanded, setRouteExpanded] = useState(true);
  const [comparison, setComparison] = useState<DirectionComparison | null>(null);
  // When the routes arrived, so the arrival time is computed from data rather than during render.
  const [routeFetchedAt, setRouteFetchedAt] = useState(0);
  const [routeLoading, setRouteLoading] = useState(false);
  // 컨트롤이 경로 카드에 가리지 않도록 카드 높이를 재서 그 위에 띄운다.
  const routePanelRef = useRef<HTMLDivElement>(null);
  const [routePanelHeight, setRoutePanelHeight] = useState(0);
  const [routeError, setRouteError] = useState('');
  const [activeMode, setActiveMode] = useState<DirectionMode | null>(null);
  const [stepsOpen, setStepsOpen] = useState(false);

  const resultsByMode = useMemo(() => {
    const map = new Map<DirectionMode, DirectionResult>();
    comparison?.results.forEach(result => map.set(result.mode, result));
    return map;
  }, [comparison]);
  const directions = activeMode ? resultsByMode.get(activeMode) ?? null : null;

  const removePolyline = useCallback(() => {
    polylineRef.current?.setMap(null);
    polylineRef.current = null;
  }, []);

  const clearComparison = useCallback(() => {
    routeAbortRef.current?.abort();
    routeAbortRef.current = null;
    routeRequestRef.current += 1;
    removePolyline();
    setComparison(null);
    setRouteFetchedAt(0);
    setRouteLoading(false);
    setRouteError('');
    setStepsOpen(false);
  }, [removePolyline]);

  const clearMarkers = useCallback(() => {
    const maps = window.kakao?.maps;
    clustererRef.current?.clear?.();
    clustererRef.current?.setMap?.(null);
    clustererRef.current = null;
    markersRef.current.forEach(({ marker, click }) => {
      if (maps?.event) maps.event.removeListener(marker, 'click', click);
      marker.setMap?.(null);
    });
    markersRef.current = [];
  }, []);

  const cancelLocation = useCallback(() => {
    locationRevisionRef.current += 1;
    locationAbortRef.current?.abort();
    locationAbortRef.current = null;
    locationTargetRef.current = null;
  }, []);

  const cancelPicking = useCallback(() => {
    cancelLocation();
    pickingRef.current = null;
    setPicking(null);
    setRouteExpanded(true);
    setLocationError('');
  }, [cancelLocation]);

  const assignEndpoint = useCallback((endpoint: RouteEndpoint, point: RoutePoint) => {
    cancelLocation();
    if (endpoint === 'origin') setOrigin(point);
    else setDestination(point);
    pickingRef.current = null;
    setPicking(null);
    setRouteIntent(true);
    setRouteExpanded(true);
    setLocationError('');
  }, [cancelLocation]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    selectedPlaceRef.current = selectedPlace;
  }, [selectedPlace]);

  useEffect(() => {
    pickingRef.current = picking;
  }, [picking]);

  useEffect(() => {
    let cancelled = false;
    readLocationConsent()
      .then(granted => {
        if (cancelled) return;
        locateOnArrivalRef.current = granted === true;
        setConsent(granted);
      })
      .catch(() => { if (!cancelled) setConsent(null); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMapAvailable(true);
    setMapError('');
    loadKakaoMaps().then(() => {
      if (cancelled || !containerRef.current || !window.kakao?.maps) return;
      const maps = window.kakao.maps;
      const center = selectedPlaceRef.current?.coordinates ?? [35.8562, 129.2247];
      const map = new maps.Map(containerRef.current, {
        center: new maps.LatLng(center[0], center[1]),
        level: 7
      });
      mapRef.current = map;
      const listener = (event?: KakaoMouseEvent) => {
        const endpoint = pickingRef.current;
        const latLng = event?.latLng;
        if (!endpoint || !latLng) return;
        assignEndpoint(endpoint, {
          kind: 'map',
          lat: latLng.getLat(),
          lng: latLng.getLng(),
          name: messages.map.mapPoint
        });
      };
      maps.event.addListener(map, 'click', listener);
      mapClickRef.current = { map, listener };
      setMapGeneration(value => value + 1);
      setMapAvailable(true);
    }).catch(() => {
      if (cancelled) return;
      setMapAvailable(false);
      setMapError(messages.map.unavailable);
    });

    return () => {
      cancelled = true;
      clearMarkers();
      removePolyline();
      locationMarkerRef.current?.setMap?.(null);
      locationMarkerRef.current = null;
      endpointMarkersRef.current.forEach(marker => marker.setMap?.(null));
      endpointMarkersRef.current = [];
      if (mapClickRef.current && window.kakao?.maps?.event) {
        window.kakao.maps.event.removeListener(mapClickRef.current.map, 'click', mapClickRef.current.listener);
      }
      mapClickRef.current = null;
      mapRef.current = null;
    };
  }, [assignEndpoint, clearMarkers, mapRetryToken, messages.map.mapPoint, messages.map.unavailable, removePolyline]);

  useEffect(() => {
    const maps = window.kakao?.maps;
    const map = mapRef.current;
    if (!maps || !map) return;
    clearMarkers();

    const markerEntries = places.map(place => {
      const marker = new maps.Marker({
        position: new maps.LatLng(place.coordinates[0], place.coordinates[1]),
        title: place.name
      });
      const click = () => {
        const endpoint = pickingRef.current;
        if (endpoint) {
          assignEndpoint(endpoint, placePoint(place));
          return;
        }
        onSelectRef.current(place);
      };
      maps.event.addListener(marker, 'click', click);
      return { marker, click };
    });
    markersRef.current = markerEntries;

    if (maps.MarkerClusterer && !picking) {
      clustererRef.current = new maps.MarkerClusterer({
        map,
        averageCenter: true,
        minLevel: 6,
        markers: markerEntries.map(entry => entry.marker)
      });
    } else {
      markerEntries.forEach(({ marker }) => marker.setMap(map));
    }

    return clearMarkers;
  }, [assignEndpoint, clearMarkers, mapGeneration, picking, places]);

  useEffect(() => {
    const maps = window.kakao?.maps;
    const map = mapRef.current;
    if (!maps || !map || !selectedPlace) return;
    map.panTo(new maps.LatLng(selectedPlace.coordinates[0], selectedPlace.coordinates[1]));
  }, [mapGeneration, selectedPlace]);

  // selectedPlace can change automatically after a nearby search. Only explicit
  // marker/map clicks or place-card actions may assign a route endpoint.

  useEffect(() => {
    const maps = window.kakao?.maps;
    const map = mapRef.current;
    locationMarkerRef.current?.setMap?.(null);
    locationMarkerRef.current = null;
    if (!maps || !map || !location) return;

    locationMarkerRef.current = new maps.Marker({
      map,
      position: new maps.LatLng(location.lat, location.lng),
      title: messages.map.currentLocation
    });
    return () => {
      locationMarkerRef.current?.setMap?.(null);
      locationMarkerRef.current = null;
    };
  }, [location, mapGeneration, messages.map.currentLocation]);

  useEffect(() => {
    const maps = window.kakao?.maps;
    const map = mapRef.current;
    endpointMarkersRef.current.forEach(marker => marker.setMap?.(null));
    endpointMarkersRef.current = [];
    if (!maps || !map) return;

    const markerImage = (file: string) => (
      maps.MarkerImage && maps.Size && maps.Point
        ? new maps.MarkerImage(`${ENDPOINT_MARKER_BASE}${file}`, new maps.Size(50, 45), { offset: new maps.Point(15, 43) })
        : undefined
    );
    const created: KakaoMarker[] = [];
    if (origin && origin.kind !== 'current') {
      created.push(new maps.Marker({
        map,
        position: new maps.LatLng(origin.lat, origin.lng),
        title: `${messages.map.origin}: ${origin.name}`,
        image: markerImage('blue_b.png'),
        zIndex: 3
      }));
    }
    if (destination) {
      created.push(new maps.Marker({
        map,
        position: new maps.LatLng(destination.lat, destination.lng),
        title: `${messages.map.destination}: ${destination.name}`,
        image: markerImage('red_b.png'),
        zIndex: 3
      }));
    }
    endpointMarkersRef.current = created;
    return () => {
      created.forEach(marker => marker.setMap?.(null));
      endpointMarkersRef.current = [];
    };
  }, [destination, mapGeneration, messages.map.destination, messages.map.origin, origin]);

  const compareRoutes = useCallback(async () => {
    if (!origin || !destination) return;
    routeAbortRef.current?.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;
    const requestId = ++routeRequestRef.current;
    setRouteLoading(true);
    setRouteError('');
    try {
      const params = new URLSearchParams({
        originLat: String(origin.lat),
        originLng: String(origin.lng),
        originName: origin.name,
        destinationLat: String(destination.lat),
        destinationLng: String(destination.lng),
        destinationName: destination.name,
        mode: 'all'
      });
      const response = await fetch(`/api/maps/directions?${params}`, {
        cache: 'no-store',
        signal: controller.signal
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? messages.map.routeCompareFailed);
      if (requestId !== routeRequestRef.current) return;
      const next = payload.data as DirectionComparison;
      const results = Array.isArray(next?.results) ? next.results : [];
      setComparison({ ...next, results });
      setRouteFetchedAt(Date.now());
      setActiveMode(current => current && results.some(result => result.mode === current)
        ? current
        : pickDefaultMode(results));
    } catch (error) {
      if (controller.signal.aborted || requestId !== routeRequestRef.current) return;
      setRouteError(error instanceof Error ? error.message : messages.map.routeCompareFailed);
    } finally {
      if (requestId === routeRequestRef.current) {
        routeAbortRef.current = null;
        setRouteLoading(false);
      }
    }
  }, [destination, messages.map.routeCompareFailed, origin]);

  useEffect(() => {
    clearComparison();
    if (!origin || !destination) return;
    void compareRoutes();
  }, [clearComparison, compareRoutes, destination, origin]);

  useEffect(() => {
    removePolyline();
    const maps = window.kakao?.maps;
    const map = mapRef.current;
    if (!maps || !map || !directions?.path.length) return;
    polylineRef.current = new maps.Polyline({
      path: directions.path.map(([lat, lng]) => new maps.LatLng(lat, lng)),
      strokeWeight: 5,
      strokeColor: '#b94f4a',
      strokeOpacity: 0.85,
      strokeStyle: isFallbackDirection(directions) || directions.pathSource === 'straight-line' ? 'shortdash' : 'solid'
    });
    polylineRef.current.setMap(map);
    const bounds = new maps.LatLngBounds();
    directions.path.forEach(([lat, lng]) => bounds.extend(new maps.LatLng(lat, lng)));
    map.setBounds(bounds);
    return removePolyline;
  }, [directions, mapGeneration, removePolyline]);

  useEffect(() => () => {
    routeAbortRef.current?.abort();
    cancelLocation();
  }, [cancelLocation]);

  useEffect(() => {
    const panel = routePanelRef.current;
    if (!panel || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setRoutePanelHeight(Math.round(entry.contentRect.height)));
    observer.observe(panel);
    return () => observer.disconnect();
  });

  const recordConsent = useCallback(async (granted: boolean, signal?: AbortSignal) => {
    setConsent(granted);
    try {
      await saveLocationConsent(granted);
    } catch (error) {
      if (!signal?.aborted) setConsent(null);
      throw error;
    }
  }, []);

  const loadNearby = useCallback(async (coordinates: Coordinates, signal: AbortSignal) => {
    if (!onNearbyPlaces || signal.aborted) return;
    onNearbyLoading?.(true);
    const stopLoading = () => onNearbyLoading?.(false);
    signal.addEventListener('abort', stopLoading, { once: true });
    try {
      const params = new URLSearchParams({
        mapX: String(coordinates.lng),
        mapY: String(coordinates.lat),
        radius: '3000',
        numOfRows: '20'
      });
      const response = await fetch(`/api/tour/nearby?${params}`, { cache: 'no-store', signal });
      const payload = await response.json() as { places?: Place[]; error?: string | { message?: string } };
      if (signal.aborted) return;
      if (!response.ok) {
        const message = typeof payload.error === 'string' ? payload.error : payload.error?.message;
        throw new Error(message ?? '주변 관광지를 불러오지 못했습니다.');
      }
      onNearbyPlaces(payload.places ?? []);
    } catch (error) {
      if (signal.aborted) return;
      setLocationError(error instanceof Error ? error.message : '주변 관광지를 불러오지 못했습니다.');
    } finally {
      signal.removeEventListener('abort', stopLoading);
      if (!signal.aborted) stopLoading();
    }
  }, [onNearbyLoading, onNearbyPlaces]);

  const requestLocation = useCallback(async (grantFromConsentDialog = false) => {
    const target = locationTargetRef.current ?? pickingRef.current;
    cancelLocation();
    const controller = new AbortController();
    locationAbortRef.current = controller;
    setLocationError('');
    if (consent !== true && !grantFromConsentDialog) {
      locationTargetRef.current = target;
      setConsent(null);
      return;
    }
    if (grantFromConsentDialog) {
      try {
        await recordConsent(true, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) return;
        setLocationError(error instanceof Error ? error.message : '위치정보 동의를 저장하지 못했습니다.');
        return;
      }
    }
    if (controller.signal.aborted) return;
    if (!navigator.geolocation) {
      setLocationError('이 브라우저는 위치정보를 지원하지 않습니다.');
      return;
    }

    acquirePosition({ maxAccuracyMeters: 100, timeoutMs: 15_000, signal: controller.signal }).then(sample => {
      if (controller.signal.aborted) return;
      const next = {
        lat: sample.lat,
        lng: sample.lng,
        accuracy: sample.accuracy
      };
      // A traveler who has not arrived yet is somewhere else entirely. Using that
      // position pulled the map to their home city and picked a place there as the
      // destination, and every route then failed the service-area check.
      if (!isInGyeongjuServiceArea(next)) {
        setLocationError(messages.map.outsideServiceArea);
        return;
      }
      setLocation(next);
      const point: RoutePoint = { kind: 'current', ...next, name: messages.map.currentLocation };
      if (target) {
        if (target === 'destination') setDestination(point);
        else setOrigin(point);
        pickingRef.current = null;
        setPicking(null);
        setRouteIntent(true);
        setRouteExpanded(true);
      } else {
        setOrigin(current => !current || current.kind === 'current' ? point : current);
      }
      void loadNearby(next, controller.signal);
      const maps = window.kakao?.maps;
      const map = mapRef.current;
      if (maps && map) map.panTo(new maps.LatLng(next.lat, next.lng));
    }, error => {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      setLocationError(error instanceof GeolocationAcquireError && error.code === 'denied'
        ? '위치 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용하거나 수동 탐색을 이용해 주세요.'
        : '현재 위치를 확인할 수 없습니다.');
    });
  }, [cancelLocation, consent, loadNearby, messages.map.currentLocation, messages.map.outsideServiceArea, recordConsent]);

  // First-time visitors get their origin filled right after the consent dialog. Returning
  // visitors skipped the dialog and were left with no origin until they found the locate
  // button. Locate once on arrival, but only when the browser still holds its grant, so
  // opening the map never springs a permission prompt on anyone.
  useEffect(() => {
    if (consent !== true || !locateOnArrivalRef.current) return;
    locateOnArrivalRef.current = false;
    const permissions = typeof navigator === 'undefined' ? undefined : navigator.permissions;
    if (!permissions?.query) return;
    const revision = locationRevisionRef.current;
    permissions.query({ name: 'geolocation' as PermissionName })
      .then(status => {
        if (status.state === 'granted' && revision === locationRevisionRef.current) void requestLocation();
      })
      .catch(() => {});
  }, [consent, requestLocation]);

  const applyCurrentLocationTo = useCallback((endpoint: RouteEndpoint) => {
    if (location) {
      assignEndpoint(endpoint, {
        kind: 'current',
        lat: location.lat,
        lng: location.lng,
        name: messages.map.currentLocation
      });
      return;
    }
    locationTargetRef.current = endpoint;
    void requestLocation();
  }, [assignEndpoint, location, messages.map.currentLocation, requestLocation]);

  const chooseMode = useCallback((mode: DirectionMode) => {
    setLocationError('');
    if (!origin) {
      setLocationError(messages.map.locationRequired);
      if (consent === true) void requestLocation();
      else setConsent(null);
      return;
    }
    if (!destination) {
      setLocationError(messages.map.selectBoth);
      return;
    }
    setActiveMode(mode);
    if (!comparison && !routeLoading) void compareRoutes();
  }, [comparison, compareRoutes, consent, destination, messages.map.locationRequired, messages.map.selectBoth, origin, requestLocation, routeLoading]);

  const swapEndpoints = useCallback(() => {
    cancelPicking();
    setOrigin(destination);
    setDestination(origin);
  }, [cancelPicking, destination, origin]);

  const searchCurrentArea = useCallback(() => {
    const map = mapRef.current;
    if (!map || !onSearchArea) return;
    const bounds = map.getBounds();
    const southWest = bounds.getSouthWest();
    const northEast = bounds.getNorthEast();
    void onSearchArea({
      south: southWest.getLat(),
      west: southWest.getLng(),
      north: northEast.getLat(),
      east: northEast.getLng()
    });
  }, [onSearchArea]);

  const retryMap = useCallback(() => {
    if (!window.kakao?.maps) {
      document.querySelector<HTMLScriptElement>('script[data-kakao-map-sdk]')?.remove();
    }
    setMapRetryToken(value => value + 1);
  }, []);

  const openKakaoMapApp = useCallback(() => {
    if (!directions) return;
    if (!directions.appUrl) {
      window.open(directions.webFallbackUrl ?? directions.externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const timer = window.setTimeout(() => {
      window.location.assign(directions.webFallbackUrl ?? directions.externalUrl);
    }, 1_300);
    const stopFallback = () => {
      if (document.visibilityState !== 'hidden') return;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', stopFallback);
    };
    document.addEventListener('visibilitychange', stopFallback);
    window.location.assign(directions.appUrl);
    window.setTimeout(() => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', stopFallback);
    }, 2_000);
  }, [directions]);

  const modeLabels: Record<DirectionMode, string> = {
    walking: messages.map.walkingRoute,
    public: messages.map.publicRoute,
    bicycle: messages.map.bicycleRoute,
    car: messages.map.carRoute
  };
  const durationTemplates = {
    durationHours: messages.map.durationHours,
    durationMinutes: messages.map.durationMinutes
  };
  const routeView = routeOpen || routeIntent;
  useEffect(() => {
    onRouteViewChange?.(routeView);
  }, [onRouteViewChange, routeView]);

  const showRoutePanel = routeView && Boolean(selectedPlace || origin || destination);
  const showPlaceCard = !routeView && Boolean(selectedPlace);
  const estimated = directions ? isFallbackDirection(directions) : false;
  // A map app tells you when you would arrive, not just how long it takes.
  const arrivalLabel = directions && routeFetchedAt && !estimated && directions.durationSeconds > 0
    ? messages.map.arriveBy.replace('{time}', new Date(routeFetchedAt + directions.durationSeconds * 1000)
      .toLocaleTimeString(locale === 'ko' ? 'ko-KR' : locale, { hour: '2-digit', minute: '2-digit' }))
    : '';
  const summaryParts = directions ? [
    `${estimated ? `${messages.map.estimateTag} ` : ''}${formatDistance(directions.distanceMeters)}`,
    estimated ? '' : formatRouteDuration(directions.durationSeconds, durationTemplates),
    arrivalLabel,
    typeof directions.summary?.transfers === 'number'
      ? messages.map.transfers.replace('{count}', String(directions.summary.transfers))
      : '',
    typeof directions.summary?.fareWon === 'number'
      ? (directions.mode === 'car' ? messages.map.toll : messages.map.fare)
        .replace('{fare}', directions.summary.fareWon.toLocaleString())
      : ''
  ].filter(Boolean) : [];

  // 카카오맵처럼 출발·도착을 위아래 한 줄씩 놓는다. 누르면 그 지점을 고르는 중이 된다.
  const endpointRow = (endpoint: RouteEndpoint, point: RoutePoint | null) => {
    const active = picking === endpoint;
    const label = endpoint === 'origin' ? messages.map.origin : messages.map.destination;
    const pickLabel = endpoint === 'origin' ? messages.map.pickOrigin : messages.map.pickDestination;
    return (
      <button
        type="button"
        aria-label={pickLabel}
        aria-pressed={active}
        onClick={() => {
          const next = picking === endpoint ? null : endpoint;
          cancelLocation();
          pickingRef.current = next;
          setRouteIntent(true);
          setPicking(next);
          // The route panel covers the map on mobile. Collapse it while picking
          // so place markers and map taps remain reachable.
          setRouteExpanded(next ? false : true);
        }}
        className={`flex min-h-10 w-full min-w-0 items-center gap-2 rounded-xl px-3 text-left text-[11px] font-black ${active ? 'bg-[#2f7567] text-white' : 'bg-[#f4f5f6] text-[#25211d]'}`}
      >
        <span className={`shrink-0 text-[10px] ${active ? 'text-white/80' : 'text-[#2f7567]'}`}>{label}</span>
        <span className="truncate">{point?.name ?? messages.map.notSet}</span>
      </button>
    );
  };

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#e8f0e3]">
      {!mapAvailable && <MapPattern />}
      <div ref={containerRef} className={`h-full w-full ${mapAvailable ? '' : 'hidden'}`} aria-label={messages.map.title} />

      {!mapAvailable && (
        <div className="absolute left-1/2 top-1/2 z-40 w-[min(320px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white/95 p-5 text-center shadow-xl ring-1 ring-black/10">
          <MapPin className="mx-auto text-[#b94f4a]" size={26} />
          <p className="mt-2 text-sm font-black">{messages.map.unavailable}</p>
          <p className="mt-1 text-[10px] leading-4 text-[#68716e]">{mapError}</p>
          <button type="button" onClick={retryMap} className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#2f7567] px-4 py-2 text-[10px] font-black text-white">
            <RotateCw size={13} /> {messages.common.retry}
          </button>
        </div>
      )}

      {mapAvailable && onSearchArea && (
        <button
          type="button"
          disabled={searchAreaLoading}
          onClick={searchCurrentArea}
          className={`absolute left-1/2 ${picking ? 'top-20' : 'top-3'} z-20 inline-flex h-9 -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-white px-3 text-[10px] font-black text-[#2f7567] shadow-lg disabled:opacity-60`}
        >
          {searchAreaLoading ? <RotateCw className="animate-spin" size={13} /> : <Search size={13} />}
          {messages.map.searchArea}
        </button>
      )}

      {consent === null && (
        <div role="dialog" aria-label={messages.map.consentTitle} className="absolute inset-x-4 top-1/2 z-[60] -translate-y-1/2 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-black/10">
          <button
            type="button"
            aria-label={messages.common.close}
            className="absolute right-3 top-3 text-[#7b817f]"
            onClick={() => { cancelPicking(); void recordConsent(false).catch(() => setConsent(null)); }}
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
            <button type="button" onClick={() => { cancelPicking(); void recordConsent(false).catch(() => setConsent(null)); }} className="rounded-full bg-[#eef1ef] px-4 py-2 text-[11px] font-black">
              {messages.map.decline}
            </button>
          </div>
        </div>
      )}

      <div className="absolute right-3 top-[158px] z-20 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void requestLocation()}
          className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#2f7567] shadow-lg"
          aria-label={messages.map.currentLocation}
        >
          <Crosshair size={19} />
        </button>
        {mapAvailable && (
          <>
            <button
              type="button"
              onClick={() => { const map = mapRef.current; if (map) map.setLevel(Math.max(1, map.getLevel() - 1), { animate: true }); }}
              className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#2f7567] shadow-lg"
              aria-label={messages.map.zoomIn}
            >
              <Plus size={17} />
            </button>
            <button
              type="button"
              onClick={() => { const map = mapRef.current; if (map) map.setLevel(Math.min(14, map.getLevel() + 1), { animate: true }); }}
              className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#2f7567] shadow-lg"
              aria-label={messages.map.zoomOut}
            >
              <Minus size={17} />
            </button>
          </>
        )}
      </div>

      {locationError && (
        <div className="pointer-events-none absolute inset-x-3 top-[110px] z-[60] flex justify-center">
          <p role="status" className="pointer-events-auto max-w-full rounded-2xl bg-white/97 px-4 py-2.5 text-[11px] font-bold leading-4 text-[#a04c48] shadow-lg">
            {locationError}
          </p>
        </div>
      )}

      {showPlaceCard && selectedPlace && (
        <div className="absolute inset-x-0 bottom-0 z-40 rounded-t-[22px] bg-white px-4 pb-5 pt-2.5 shadow-[0_-8px_28px_rgba(18,55,47,.18)]">
          <span aria-hidden="true" className="mx-auto mb-3 block h-1.5 w-12 rounded-full bg-[#dfe3e0]" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[17px] font-black leading-6">{selectedPlace.name}</p>
              <p className="mt-0.5 truncate text-[11px] text-[#68716e]">
                {kakaoCategoryOf(selectedPlace) ?? messages.categories[selectedPlace.category]} · {selectedPlace.address}
              </p>
            </div>
            <button
              type="button"
              aria-label={messages.common.close}
              onClick={() => onDismissPlace?.()}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#f1f2f4] text-[#5d6a65]"
            >
              <X size={15} />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            {selectedPlace.kakaoPlaceUrl ? (
              <a href={selectedPlace.kakaoPlaceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-black text-[#2f7567]">
                <ExternalLink size={13} /> {messages.map.kakaoDetail}
              </a>
            ) : <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#8a918e]"><MapPin size={13} /> {messages.map.title}</span>}
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => assignEndpoint('origin', placePoint(selectedPlace))}
                aria-label={messages.map.pickOrigin}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#eef3ee] px-5 text-[12px] font-black text-[#2f7567]"
              >
                {messages.map.origin}
              </button>
              <button
                type="button"
                onClick={() => assignEndpoint('destination', placePoint(selectedPlace))}
                aria-label={messages.map.pickDestination}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#b94f4a] px-5 text-[12px] font-black text-white"
              >
                {messages.map.destination}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRoutePanel && routeExpanded && (
        <div className="absolute inset-0 z-50 flex flex-col bg-[#fbfaf8]">
          <div className="bg-[#12372f] px-3 pb-3 pt-2.5 text-white">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1">
                {directionModes.map(mode => {
                  const Icon = modeIcons[mode];
                  const active = activeMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={active}
                      aria-label={modeLabels[mode]}
                      onClick={() => chooseMode(mode)}
                      className={`grid h-9 flex-1 place-items-center rounded-full ${active ? 'bg-white text-[#12372f]' : 'text-white/75'}`}
                    >
                      <Icon size={17} />
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                aria-label={messages.common.close}
                onClick={() => { cancelPicking(); setOrigin(null); setDestination(null); setRouteIntent(false); clearComparison(); onCloseRoute?.(); }}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/85"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-2.5 flex items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {endpointRow('origin', origin)}
                {endpointRow('destination', destination)}
              </div>
              <button
                type="button"
                onClick={swapEndpoints}
                disabled={!origin && !destination}
                aria-label={messages.map.swap}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-white disabled:opacity-40"
              >
                <ArrowUpDown size={15} />
              </button>
            </div>

            {picking && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-white/12 px-3 py-2 text-[10px] font-bold">
                <span className="min-w-0 leading-4">{messages.map.pickHint}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => applyCurrentLocationTo(picking)} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1.5 font-black text-[#12372f]">
                    <Crosshair size={11} /> {messages.map.useCurrentLocation}
                  </button>
                  <button type="button" onClick={cancelPicking} className="rounded-full px-2 py-1.5 font-black text-white/85">
                    {messages.map.cancel}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!(origin && destination) ? (
              <p className="px-5 py-8 text-center text-[12px] font-bold leading-5 text-[#68716e]">{messages.map.selectBoth}</p>
            ) : routeLoading ? (
              <p className="flex items-center justify-center gap-1.5 px-5 py-8 text-[12px] font-bold text-[#68716e]" role="status">
                <RotateCw className="animate-spin" size={14} /> {messages.map.routeComparing}
              </p>
            ) : (
              <>
                {directions && (
                  <section className="border-b border-[#ece7df] bg-white px-5 py-4">
                    <p className="text-[22px] font-black leading-7">
                      {isFallbackDirection(directions) ? messages.map.noRoute : formatRouteDuration(directions.durationSeconds, durationTemplates)}
                    </p>
                    <p className="mt-1 text-[12px] font-bold text-[#68716e]">{summaryParts.join(' · ')}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setRouteExpanded(false)}
                        className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-[#2f7567] px-4 text-[11px] font-black text-white"
                      >
                        <MapPin size={13} /> {messages.map.seeOnMap}
                      </button>
                      <a className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-[#eef3ee] px-4 text-[11px] font-black text-[#2f7567]" href={directions.appUrl ?? directions.externalUrl} target="_blank" rel="noreferrer">
                        <Navigation size={13} /> {messages.map.openApp}
                      </a>
                      <a className="inline-flex min-h-10 items-center px-2 text-[11px] font-bold text-[#68716e]" href={directions.webFallbackUrl ?? directions.externalUrl} target="_blank" rel="noreferrer">
                        {messages.map.openWeb}
                      </a>
                    </div>
                    {(routeError || directions.disclaimer || directions.pathSource === 'straight-line') && (
                      <p className="mt-2 text-[11px] leading-5 text-[#a04c48]" role="status">{routeError || (estimated ? messages.map.walkingEstimate : directions.disclaimer)}</p>
                    )}
                  </section>
                )}

                {directions?.steps && directions.steps.length > 0 && (
                  <ol className="divide-y divide-[#f0ece5] bg-white">
                    {directions.steps.map((step, index) => (
                      <li key={`${index}-${step.guidance}`}>
                        <button
                          type="button"
                          disabled={!step.coordinates}
                          onClick={() => {
                            const maps = window.kakao?.maps;
                            const map = mapRef.current;
                            if (!maps || !map || !step.coordinates) return;
                            setRouteExpanded(false);
                            map.setLevel(Math.min(map.getLevel(), 4), { animate: true });
                            map.panTo(new maps.LatLng(step.coordinates[0], step.coordinates[1]));
                          }}
                          aria-label={messages.map.stepOnMap.replace('{step}', String(index + 1))}
                          className="flex w-full items-baseline gap-3 px-5 py-3 text-left text-[12px] leading-5 disabled:cursor-default"
                        >
                          <span className="shrink-0 font-black text-[#2f7567]">{index + 1}</span>
                          <span className="min-w-0 flex-1">{step.guidance}</span>
                          {typeof step.durationSeconds === 'number' && step.durationSeconds > 0 && (
                            <span className="shrink-0 text-[11px] tabular-nums text-[#8a918e]">{formatRouteDuration(step.durationSeconds, durationTemplates)}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ol>
                )}

                <section className="px-5 py-4">
                  <p className="text-[11px] font-black text-[#8a918e]">{messages.map.otherModes}</p>
                  <div className="mt-2 space-y-2">
                    {directionModes.filter(mode => mode !== activeMode).map(mode => {
                      const result = resultsByMode.get(mode);
                      const Icon = modeIcons[mode];
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => chooseMode(mode)}
                          className="flex w-full min-h-12 items-center gap-3 rounded-xl bg-white px-4 text-left shadow-sm ring-1 ring-black/5"
                        >
                          <Icon size={16} className="shrink-0 text-[#2f7567]" />
                          <span className="min-w-0 flex-1 text-[12px] font-black">{modeLabels[mode]}</span>
                          <span className="shrink-0 text-[12px] font-bold tabular-nums text-[#68716e]">
                            {result
                              ? isFallbackDirection(result) ? messages.map.noRoute : `${formatRouteDuration(result.durationSeconds, durationTemplates)} · ${formatDistance(result.distanceMeters)}`
                              : '–'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {(routeError || comparison?.results.some(isFallbackDirection)) && (
                  <div className="px-5 pb-6">
                    <button type="button" onClick={() => void compareRoutes()} className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-[#eef3ee] px-4 text-[11px] font-bold text-[#2f7567]">
                      <RotateCw size={13} /> {messages.common.retry}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {showRoutePanel && !routeExpanded && picking && (
        <div className="absolute inset-x-3 top-3 z-40 flex items-center justify-between gap-2 rounded-2xl bg-[#12372f]/95 px-3 py-2.5 text-[10px] font-bold text-white shadow-lg">
          <span className="min-w-0 leading-4">{messages.map.pickHint}</span>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => applyCurrentLocationTo(picking)} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1.5 font-black text-[#12372f]">
              <Crosshair size={11} /> {messages.map.useCurrentLocation}
            </button>
            <button type="button" onClick={cancelPicking} className="rounded-full px-2 py-1.5 font-black text-white/85">
              {messages.map.cancel}
            </button>
          </div>
        </div>
      )}

      {showRoutePanel && !routeExpanded && directions && (
        <button
          type="button"
          onClick={() => setRouteExpanded(true)}
          className="absolute inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 rounded-t-[22px] bg-white px-5 pb-5 pt-3 text-left shadow-[0_-8px_28px_rgba(18,55,47,.18)]"
        >
          <span className="min-w-0">
            <span className="block text-[15px] font-black">
              {isFallbackDirection(directions) ? messages.map.noRoute : formatRouteDuration(directions.durationSeconds, durationTemplates)}
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-[#68716e]">{summaryParts.join(' · ')}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-[#eef3ee] px-3 py-2 text-[11px] font-black text-[#2f7567]">
            {messages.map.routeSteps} <ChevronUp size={13} />
          </span>
        </button>
      )}
    </div>
  );
}

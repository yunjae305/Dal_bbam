'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Crosshair,
  ExternalLink,
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
  searchAreaLoading = false
}: {
  places: MapPlace[];
  selectedPlace?: MapPlace;
  onSelect: (place: MapPlace) => void;
  onNearbyPlaces?: (places: Place[]) => void;
  onNearbyLoading?: (loading: boolean) => void;
  onSearchArea?: (bounds: MapBounds) => void | Promise<void>;
  searchAreaLoading?: boolean;
}) {
  const { locale, messages } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const selectedPlaceRef = useRef(selectedPlace);
  const lastSelectedIdRef = useRef<string | null>(null);
  const pickingRef = useRef<RouteEndpoint | null>(null);
  const locationTargetRef = useRef<RouteEndpoint | null>(null);
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
  const [comparison, setComparison] = useState<DirectionComparison | null>(null);
  // When the routes arrived, so the arrival time is computed from data rather than during render.
  const [routeFetchedAt, setRouteFetchedAt] = useState(0);
  const [routeLoading, setRouteLoading] = useState(false);
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

  const assignEndpoint = useCallback((endpoint: RouteEndpoint, point: RoutePoint) => {
    if (endpoint === 'origin') setOrigin(point);
    else setDestination(point);
    setPicking(null);
    setLocationError('');
  }, []);

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
    readLocationConsent()
      .then(granted => {
        locateOnArrivalRef.current = granted === true;
        setConsent(granted);
      })
      .catch(() => setConsent(null));
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

    if (maps.MarkerClusterer) {
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
  }, [assignEndpoint, clearMarkers, mapGeneration, places]);

  useEffect(() => {
    const maps = window.kakao?.maps;
    const map = mapRef.current;
    if (!maps || !map || !selectedPlace) return;
    map.panTo(new maps.LatLng(selectedPlace.coordinates[0], selectedPlace.coordinates[1]));
  }, [mapGeneration, selectedPlace]);

  // The selected place feeds whichever endpoint is being picked; by default it is the destination.
  useEffect(() => {
    if (!selectedPlace) return;
    if (lastSelectedIdRef.current === selectedPlace.contentId) return;
    lastSelectedIdRef.current = selectedPlace.contentId;
    const point = placePoint(selectedPlace);
    if (pickingRef.current === 'origin') {
      assignEndpoint('origin', point);
    } else {
      assignEndpoint('destination', point);
    }
  }, [assignEndpoint, selectedPlace]);

  // A fresh GPS fix becomes the origin unless the user explicitly asked for it elsewhere.
  useEffect(() => {
    if (!location) return;
    const point: RoutePoint = {
      kind: 'current',
      lat: location.lat,
      lng: location.lng,
      name: messages.map.currentLocation
    };
    const target = locationTargetRef.current;
    locationTargetRef.current = null;
    if (target === 'destination') {
      setDestination(point);
      setPicking(null);
      return;
    }
    if (target === 'origin') {
      setOrigin(point);
      setPicking(null);
      return;
    }
    setOrigin(current => !current || current.kind === 'current' ? point : current);
  }, [location, messages.map.currentLocation]);

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
  }, []);

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
    if (!onNearbyPlaces) return;
    onNearbyLoading?.(true);
    try {
      const params = new URLSearchParams({
        mapX: String(coordinates.lng),
        mapY: String(coordinates.lat),
        radius: '3000',
        numOfRows: '20'
      });
      const response = await fetch(`/api/tour/nearby?${params}`, { cache: 'no-store' });
      const payload = await response.json() as { places?: Place[]; error?: string | { message?: string } };
      if (!response.ok) {
        const message = typeof payload.error === 'string' ? payload.error : payload.error?.message;
        throw new Error(message ?? '주변 관광지를 불러오지 못했습니다.');
      }
      onNearbyPlaces(payload.places ?? []);
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
      // A traveler who has not arrived yet is somewhere else entirely. Using that
      // position pulled the map to their home city and picked a place there as the
      // destination, and every route then failed the service-area check.
      if (!isInGyeongjuServiceArea(next)) {
        locationTargetRef.current = null;
        setLocationError(messages.map.outsideServiceArea);
        return;
      }
      setLocation(next);
      void loadNearby(next);
      const maps = window.kakao?.maps;
      const map = mapRef.current;
      if (maps && map) map.panTo(new maps.LatLng(next.lat, next.lng));
    }, error => {
      locationTargetRef.current = null;
      setLocationError(error.code === error.PERMISSION_DENIED
        ? '위치 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용하거나 수동 탐색을 이용해 주세요.'
        : '현재 위치를 확인할 수 없습니다.');
    }, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000
    });
  }, [consent, loadNearby, messages.map.outsideServiceArea, recordConsent]);

  // First-time visitors get their origin filled right after the consent dialog. Returning
  // visitors skipped the dialog and were left with no origin until they found the locate
  // button. Locate once on arrival, but only when the browser still holds its grant, so
  // opening the map never springs a permission prompt on anyone.
  useEffect(() => {
    if (consent !== true || !locateOnArrivalRef.current) return;
    locateOnArrivalRef.current = false;
    const permissions = typeof navigator === 'undefined' ? undefined : navigator.permissions;
    if (!permissions?.query) return;
    permissions.query({ name: 'geolocation' as PermissionName })
      .then(status => { if (status.state === 'granted') void requestLocation(); })
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
    setPicking(null);
    setOrigin(destination);
    setDestination(origin);
  }, [destination, origin]);

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
  const showRoutePanel = Boolean(selectedPlace || origin || destination);
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

  const endpointChip = (endpoint: RouteEndpoint, point: RoutePoint | null) => {
    const active = picking === endpoint;
    const label = endpoint === 'origin' ? messages.map.origin : messages.map.destination;
    const pickLabel = endpoint === 'origin' ? messages.map.pickOrigin : messages.map.pickDestination;
    return (
      <button
        type="button"
        aria-label={pickLabel}
        aria-pressed={active}
        onClick={() => setPicking(current => current === endpoint ? null : endpoint)}
        className={`flex min-h-9 min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-left text-[9px] font-black ${active ? 'bg-[#2f7567] text-white' : 'bg-[#eef3ee] text-[#1f2a27]'}`}
      >
        <span className={`shrink-0 ${active ? 'text-white/80' : 'text-[#2f7567]'}`}>{label}</span>
        <span className="truncate">{point?.name ?? messages.map.notSet}</span>
      </button>
    );
  };

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#e8f0e3]">
      {!mapAvailable && <MapPattern />}
      <div ref={containerRef} className={`h-full w-full ${mapAvailable ? '' : 'hidden'}`} aria-label={messages.map.title} />

      {!mapAvailable && (
        <div className="absolute left-1/2 top-1/2 z-20 w-[min(320px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white/95 p-5 text-center shadow-xl ring-1 ring-black/10">
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
          className="absolute right-4 top-4 z-20 inline-flex h-9 items-center gap-1 rounded-full bg-white px-3 text-[10px] font-black text-[#2f7567] shadow-lg disabled:opacity-60"
        >
          {searchAreaLoading ? <RotateCw className="animate-spin" size={13} /> : <Search size={13} />}
          {messages.map.searchArea}
        </button>
      )}

      {consent === null && (
        <div className="absolute inset-x-4 top-16 z-30 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-black/10">
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

      <div className="absolute left-4 top-4 z-20 flex gap-2">
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

      {showRoutePanel && (
        <div className="absolute bottom-[84px] left-4 right-4 z-20 max-h-[calc(100%-148px)] overflow-y-auto rounded-2xl bg-white/95 p-3 shadow-xl backdrop-blur">
          {selectedPlace && (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{selectedPlace.name}</p>
                <p className="truncate text-[10px] text-[#68716e]">{selectedPlace.address}</p>
              </div>
              {selectedPlace.kakaoPlaceUrl ? (
                <a href={selectedPlace.kakaoPlaceUrl} target="_blank" rel="noreferrer" aria-label={messages.map.kakaoDetail} className="shrink-0 text-[#2f7567]">
                  <ExternalLink size={20} />
                </a>
              ) : <MapPin size={22} className="shrink-0 text-[#b94f4a]" />}
            </div>
          )}

          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
            {endpointChip('origin', origin)}
            <button
              type="button"
              onClick={swapEndpoints}
              disabled={!origin && !destination}
              aria-label={messages.map.swap}
              className="grid h-8 w-8 place-items-center rounded-full bg-white text-[#2f7567] shadow-sm ring-1 ring-black/5 disabled:opacity-40"
            >
              <ArrowUpDown size={14} />
            </button>
            {endpointChip('destination', destination)}
          </div>

          {picking && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-[#fff7df] px-3 py-2 text-[9px] font-bold text-[#866d2f]" role="status">
              <span className="min-w-0 leading-4">{messages.map.pickHint}</span>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => applyCurrentLocationTo(picking)} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1.5 font-black text-[#2f7567]">
                  <Crosshair size={11} /> {messages.map.useCurrentLocation}
                </button>
                <button type="button" onClick={() => setPicking(null)} className="rounded-full px-2 py-1.5 font-black text-[#866d2f]">
                  {messages.map.cancel}
                </button>
              </div>
            </div>
          )}

          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {directionModes.map(mode => {
              const result = resultsByMode.get(mode);
              const active = activeMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={active}
                  onClick={() => chooseMode(mode)}
                  className={`flex min-h-11 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-[9px] font-black ${active ? 'bg-[#b94f4a] text-white' : 'bg-[#eef3ee]'}`}
                >
                  <span>{modeLabels[mode]}</span>
                  <span className={`mt-0.5 text-[10px] tabular-nums ${active ? 'text-white' : 'text-[#2f7567]'}`}>
                    {result
                      ? isFallbackDirection(result) ? messages.map.noRoute : formatRouteDuration(result.durationSeconds, durationTemplates)
                      : routeLoading ? '…' : '—'}
                  </span>
                  {result && <span className="mt-0.5 text-[10px] tabular-nums">
                    {isFallbackDirection(result) ? `${messages.map.estimateTag} ` : ''}{formatDistance(result.distanceMeters)}
                  </span>}
                </button>
              );
            })}
          </div>

          {routeLoading && (
            <p className="mt-2 inline-flex items-center gap-1 text-[9px] font-bold text-[#68716e]" role="status">
              <RotateCw className="animate-spin" size={11} /> {messages.map.routeComparing}
            </p>
          )}
          {(routeError || comparison?.results.some(isFallbackDirection)) && !routeLoading && (
            <button type="button" onClick={() => void compareRoutes()} className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs font-bold text-[#2f7567]">
              <RotateCw size={14} /> {messages.common.retry}
            </button>
          )}

          {directions && (
            <div className="mt-2 flex items-center justify-between gap-3 text-[10px]">
              <span className="min-w-0 text-pretty leading-5">{summaryParts.join(' · ')}</span>
              <div className="flex shrink-0 items-center gap-2">
                {directions.steps && directions.steps.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setStepsOpen(value => !value)}
                    aria-expanded={stepsOpen}
                    className="inline-flex items-center gap-0.5 font-black text-[#68716e]"
                  >
                    {messages.map.routeSteps} {stepsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                )}
                <button type="button" onClick={openKakaoMapApp} className="inline-flex items-center gap-1 font-black text-[#2f7567]">
                  <Navigation size={12} /> {messages.map.openApp}
                </button>
                <a className="font-bold text-[#68716e]" href={directions.webFallbackUrl ?? directions.externalUrl} target="_blank" rel="noreferrer">
                  {messages.map.openWeb}
                </a>
              </div>
            </div>
          )}

          {directions && stepsOpen && directions.steps && directions.steps.length > 0 && (
            <ol className="mt-2 max-h-28 space-y-1 overflow-y-auto rounded-xl bg-[#f7f4ef] px-3 py-2 text-[9px] leading-4 text-[#4f5754]">
              {directions.steps.map((step, index) => (
                <li key={`${index}-${step.guidance}`}>
                  <button
                    type="button"
                    disabled={!step.coordinates}
                    onClick={() => {
                      const maps = window.kakao?.maps;
                      const map = mapRef.current;
                      if (!maps || !map || !step.coordinates) return;
                      map.setLevel(Math.min(map.getLevel(), 4), { animate: true });
                      map.panTo(new maps.LatLng(step.coordinates[0], step.coordinates[1]));
                    }}
                    aria-label={messages.map.stepOnMap.replace('{step}', String(index + 1))}
                    className="flex w-full gap-2 text-left disabled:cursor-default"
                  >
                    <span className="shrink-0 font-black text-[#2f7567]">{index + 1}</span>
                    <span className="min-w-0 flex-1">{step.guidance}</span>
                    {typeof step.durationSeconds === 'number' && step.durationSeconds > 0 && (
                      <span className="shrink-0 tabular-nums text-[#8a918e]">{formatRouteDuration(step.durationSeconds, durationTemplates)}</span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
          )}

          {(locationError || routeError || directions?.disclaimer || directions?.pathSource === 'straight-line') && (
            <p className="mt-2 text-xs leading-5 text-[#a04c48]" role="status">{locationError || routeError || (estimated ? messages.map.routeUnavailable : messages.map.pathUnavailable)}</p>
          )}
        </div>
      )}
    </div>
  );
}

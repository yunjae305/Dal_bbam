// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '@/shared/types';
import { readLocationConsent, saveLocationConsent } from '@/frontend/location-consent';
import { KakaoMapExplorer } from '@/frontend/components/travel/kakao-map-explorer';

vi.mock('@/frontend/location-consent', () => ({
  readLocationConsent: vi.fn(),
  saveLocationConsent: vi.fn()
}));

vi.mock('@/frontend/i18n/locale-context', () => ({
  useLocale: () => ({
    messages: {
      common: { close: '닫기', retry: '다시 시도' },
      map: {
        title: '경주 지도', currentLocation: '현재 위치', consentTitle: '위치 동의',
        consentBody: '위치를 사용합니다.', allow: '동의하고 위치 사용', decline: '수동 탐색',
        locationRequired: '길찾기 전에 현재 위치를 확인해 주세요.', unavailable: '지도 오류',
        searchArea: '현 지도에서 검색', walkingRoute: '도보', publicRoute: '대중교통',
        bicycleRoute: '자전거', carRoute: '자동차', kakaoDetail: '카카오 상세',
        openApp: '카카오맵 앱', openWeb: '웹으로',
        origin: '출발', destination: '도착', swap: '출발·도착 바꾸기', pickOrigin: '출발지 선택',
        pickDestination: '도착지 선택', pickHint: '지도를 탭하거나 장소를 선택하세요',
        useCurrentLocation: '현재 위치 사용', mapPoint: '지도에서 선택한 지점', notSet: '선택 안 됨',
        cancel: '취소', routeComparing: '경로를 비교하는 중…', routeCompareFailed: '경로 실패',
        selectBoth: '출발지와 도착지를 모두 선택해 주세요.', transfers: '환승 {count}회',
        fare: '요금 {fare}원', toll: '통행료 {fare}원', durationHours: '{h}시간 {m}분',
        durationMinutes: '{m}분', estimateTag: '직선 예상', routeSteps: '경로 안내', noRoute: '경로 없음'
      }
    }
  })
}));

const firstPlace: Place = {
  id: 'place-1', contentId: 'place-1', category: 'heritage', name: '첨성대',
  description: '', address: '경주시', distance: '', rating: 4.8, bestTime: '', image: '',
  tags: [], coordinates: [35.8347, 129.2191], translations: {}
};
const secondPlace: Place = {
  ...firstPlace,
  id: 'place-2',
  contentId: 'place-2',
  name: '불국사',
  coordinates: [35.7901, 129.332]
};

type MapClickListener = (event?: { latLng?: { getLat: () => number; getLng: () => number } }) => void;

function routeResult(mode: string, durationSeconds: number, extra: Record<string, unknown> = {}) {
  return {
    mode,
    path: [[35.8562, 129.2247], [35.8347, 129.2191]],
    distanceMeters: 1000,
    durationSeconds,
    source: `kakao-map-${mode}`,
    externalUrl: `https://map.kakao.com/link/by/${mode}/a/b`,
    webFallbackUrl: `https://map.kakao.com/link/by/${mode}/a/b`,
    appUrl: `kakaomap://route?by=${mode}`,
    ...extra
  };
}

function comparisonPayload() {
  return {
    data: {
      origin: { lat: 35.8562, lng: 129.2247, name: '현재 위치' },
      destination: { lat: 35.8347, lng: 129.2191, name: '첨성대' },
      straightDistanceMeters: 900,
      results: [
        routeResult('walking', 1500),
        routeResult('public', 4200, { summary: { transfers: 1, fareWon: 1450 } }),
        routeResult('bicycle', 600),
        routeResult('car', 300, { steps: [{ guidance: '우회전', durationSeconds: 60 }] })
      ]
    }
  };
}

function installKakaoMock() {
  const markerInstances: Array<{ setMap: ReturnType<typeof vi.fn> }> = [];
  const polylineInstances: Array<{ setMap: ReturnType<typeof vi.fn> }> = [];
  const listeners: Array<{ target: object; type: string; listener: MapClickListener }> = [];
  const event = {
    addListener: vi.fn((target: object, type: string, listener: MapClickListener) => {
      listeners.push({ target, type, listener });
    }),
    removeListener: vi.fn()
  };
  const map = {
    panTo: vi.fn(),
    setBounds: vi.fn(),
    getBounds: () => ({
      getSouthWest: () => ({ getLat: () => 35.7, getLng: () => 129 }),
      getNorthEast: () => ({ getLat: () => 36, getLng: () => 129.4 })
    })
  };
  const maps = {
    load: (callback: () => void) => callback(),
    Map: vi.fn(function MockMap() { return map; }),
    LatLng: vi.fn(function MockLatLng(lat: number, lng: number) { return { lat, lng }; }),
    Marker: vi.fn(function MockMarker() {
      const marker = { setMap: vi.fn() };
      markerInstances.push(marker);
      return marker;
    }),
    MarkerClusterer: vi.fn(function MockMarkerClusterer() {
      return { clear: vi.fn(), setMap: vi.fn() };
    }),
    Polyline: vi.fn(function MockPolyline() {
      const polyline = { setMap: vi.fn() };
      polylineInstances.push(polyline);
      return polyline;
    }),
    LatLngBounds: vi.fn(function MockLatLngBounds() { return { extend: vi.fn() }; }),
    event
  };
  window.kakao = { maps } as typeof window.kakao;
  return { map, maps, event, markerInstances, polylineInstances, listeners };
}

function installGeolocation(read: () => { latitude: number; longitude: number }) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (success: PositionCallback) => success({
        coords: { ...read(), accuracy: 10 }
      } as GeolocationPosition)
    }
  });
}

describe('KakaoMapExplorer route state', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(saveLocationConsent).mockResolvedValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete window.kakao;
  });

  it('never substitutes a fixed Gyeongju origin when GPS is unavailable', async () => {
    installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(false);
    render(<KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: /^도보/ }));

    expect(await screen.findByText('길찾기 전에 현재 위치를 확인해 주세요.')).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('compares all four modes once origin and destination are set and shows durations', async () => {
    installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(true);
    installGeolocation(() => ({ latitude: 35.8562, longitude: 129.2247 }));
    fetchMock.mockResolvedValue({ ok: true, json: async () => comparisonPayload() });

    render(<KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '현재 위치' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost');
    expect(url.pathname).toBe('/api/maps/directions');
    expect(url.searchParams.get('mode')).toBe('all');
    expect(url.searchParams.get('originLat')).toBe('35.8562');
    expect(url.searchParams.get('destinationName')).toBe('첨성대');

    expect(await screen.findByRole('button', { name: /^도보\s*25분/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /^대중교통\s*1시간 10분/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /^자전거\s*10분/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /^자동차\s*5분/ })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: /대중교통/ }));
    expect(await screen.findByText(/환승 1회 · 요금 1,450원/)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('lets the user pick an origin from the map and swap the endpoints', async () => {
    const kakao = installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(true);
    fetchMock.mockResolvedValue({ ok: true, json: async () => comparisonPayload() });

    render(<KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '출발지 선택' }));
    expect(screen.getByText('지도를 탭하거나 장소를 선택하세요')).toBeVisible();

    const mapClick = kakao.listeners.find(entry => entry.target === kakao.map && entry.type === 'click');
    expect(mapClick).toBeDefined();
    mapClick?.listener({ latLng: { getLat: () => 35.84, getLng: () => 129.21 } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost');
    expect(url.searchParams.get('originName')).toBe('지도에서 선택한 지점');
    expect(url.searchParams.get('originLat')).toBe('35.84');
    expect(screen.getByRole('button', { name: '출발지 선택' })).toHaveTextContent('지도에서 선택한 지점');

    fireEvent.click(screen.getByRole('button', { name: '출발·도착 바꾸기' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const swapped = new URL(String(fetchMock.mock.calls[1]?.[0]), 'http://localhost');
    expect(swapped.searchParams.get('originName')).toBe('첨성대');
    expect(swapped.searchParams.get('destinationName')).toBe('지도에서 선택한 지점');
  });

  it('clears old polylines when mode, GPS, or selected place changes and removes marker events', async () => {
    const kakao = installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(true);
    let coordinates = { latitude: 35.8562, longitude: 129.2247 };
    installGeolocation(() => coordinates);
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => comparisonPayload() }));

    const view = render(
      <KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={vi.fn()} />
    );
    fireEvent.click(await screen.findByRole('button', { name: '현재 위치' }));
    await waitFor(() => expect(kakao.polylineInstances).toHaveLength(1));
    const carLine = kakao.polylineInstances[0];

    fireEvent.click(screen.getByRole('button', { name: /도보/ }));
    await waitFor(() => expect(carLine.setMap).toHaveBeenCalledWith(null));
    await waitFor(() => expect(kakao.polylineInstances).toHaveLength(2));
    const walkingLine = kakao.polylineInstances[1];

    coordinates = { latitude: 35.86, longitude: 129.23 };
    fireEvent.click(screen.getByRole('button', { name: '현재 위치' }));
    await waitFor(() => expect(walkingLine.setMap).toHaveBeenCalledWith(null));
    await waitFor(() => expect(kakao.polylineInstances).toHaveLength(3));
    const refreshedLine = kakao.polylineInstances[2];

    view.rerender(
      <KakaoMapExplorer places={[secondPlace]} selectedPlace={secondPlace} onSelect={vi.fn()} />
    );
    await waitFor(() => expect(refreshedLine.setMap).toHaveBeenCalledWith(null));
    await waitFor(() => expect(kakao.event.removeListener).toHaveBeenCalled());
  });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    locale: 'ko',
    messages: {
      common: { close: '닫기', retry: '다시 시도' },
      categories: { heritage: '문화유산', attraction: '관광지', food: '맛집', lodging: '숙박', festival: '축제', nature: '자연', experience: '체험' },
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
        durationMinutes: '{m}분', estimateTag: '직선 예상', routeSteps: '경로 안내', noRoute: '경로 없음',
        zoomIn: '지도 확대', zoomOut: '지도 축소',
        outsideServiceArea: '지금 위치가 경주 밖이라 현재 위치를 출발지로 쓸 수 없어요.',
        arriveBy: '{time} 도착 예정', stepOnMap: '{step}번 지점 지도에서 보기'
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
        routeResult('car', 300, { steps: [{ guidance: '우회전', durationSeconds: 60, coordinates: [35.8400, 129.2200] }] })
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
    setLevel: vi.fn(),
    getLevel: () => 5,
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

function installPermission(state: PermissionState) {
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn().mockResolvedValue({ state }) }
  });
}

function installGeolocation(read: () => { latitude: number; longitude: number }) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: (success: PositionCallback) => {
        success({
          coords: { ...read(), accuracy: 10 },
          timestamp: Date.now()
        } as GeolocationPosition);
        return 1;
      },
      clearWatch: vi.fn(),
      getCurrentPosition: (success: PositionCallback) => success({
        coords: { ...read(), accuracy: 10 }
      } as GeolocationPosition)
    }
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function installPendingGeolocation() {
  const callbacks: Array<{ success: PositionCallback; error: PositionErrorCallback | null | undefined }> = [];
  const clearWatch = vi.fn();
  const watchPosition = vi.fn((success: PositionCallback, error?: PositionErrorCallback | null) => {
    callbacks.push({ success, error });
    return callbacks.length;
  });
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { watchPosition, clearWatch }
  });
  return {
    watchPosition, clearWatch,
    succeed: (index = 0, latitude = 35.8562) => callbacks[index].success({
      coords: { latitude, longitude: 129.2247, accuracy: 10 }, timestamp: Date.now()
    } as GeolocationPosition),
    fail: (index = 0) => callbacks[index].error?.({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError)
  };
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
    Reflect.deleteProperty(navigator, 'permissions');
    Reflect.deleteProperty(navigator, 'geolocation');
  });

  it('never substitutes a fixed Gyeongju origin when GPS is unavailable', async () => {
    installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(false);
    render(<KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={vi.fn()} />);

    // 장소를 골라도 출발·도착을 정하기 전에는 경로를 계산하지 않는다.
    expect(await screen.findByRole('button', { name: '도착지 선택' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^도보/ })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('compares all four modes once origin and destination are set and shows durations', async () => {
    installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(true);
    installGeolocation(() => ({ latitude: 35.8562, longitude: 129.2247 }));
    fetchMock.mockResolvedValue({ ok: true, json: async () => comparisonPayload() });

    render(<KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '도착지 선택' }));
    fireEvent.click(await screen.findByRole('button', { name: '현재 위치' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost');
    expect(url.pathname).toBe('/api/maps/directions');
    expect(url.searchParams.get('mode')).toBe('all');
    expect(url.searchParams.get('originLat')).toBe('35.8562');
    expect(url.searchParams.get('destinationName')).toBe('첨성대');

    // 자동차가 기본으로 잡히고, 나머지 수단은 시간과 거리가 함께 보인다.
    expect(await screen.findByRole('button', { name: '자동차' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^도보\s*25분/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /^대중교통\s*1시간 10분/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /^자전거\s*10분/ })).toBeVisible();


    fireEvent.click(screen.getByRole('button', { name: /^대중교통\s*1시간 10분/ }));
    expect(await screen.findByText(/환승 1회 · 요금 1,450원/)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fills the origin on arrival for a returning visitor whose browser kept the grant', async () => {
    installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(true);
    installGeolocation(() => ({ latitude: 35.8347, longitude: 129.219 }));
    installPermission('granted');
    fetchMock.mockResolvedValue({ ok: true, json: async () => comparisonPayload() });

    render(<KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '도착지 선택' }));

    // No tap on the locate button: the route request already carries the GPS origin.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost');
    expect(url.searchParams.get('originLat')).toBe('35.8347');
    expect(url.searchParams.get('destinationName')).toBe('첨성대');
  });

  it('waits for a tap instead of prompting when the browser has not kept the grant', async () => {
    installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(true);
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
    installPermission('prompt');

    render(<KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={vi.fn()} />);
    await screen.findByRole('button', { name: '현재 위치' });
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets the user pick an origin from the map and swap the endpoints', async () => {
    const kakao = installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(true);
    fetchMock.mockResolvedValue({ ok: true, json: async () => comparisonPayload() });

    render(<KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={vi.fn()} />);
    // 장소 카드에서 도착지를 정하면 길찾기 화면으로 넘어간다.
    fireEvent.click(await screen.findByRole('button', { name: '도착지 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '출발지 선택' }));
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
    fireEvent.click(await screen.findByRole('button', { name: '도착지 선택' }));
    fireEvent.click(await screen.findByRole('button', { name: '현재 위치' }));
    await waitFor(() => expect(kakao.polylineInstances).toHaveLength(1));
    const carLine = kakao.polylineInstances[0];

    fireEvent.click(screen.getByRole('button', { name: /^도보\s*25분/ }));
    await waitFor(() => expect(carLine.setMap).toHaveBeenCalledWith(null));
    await waitFor(() => expect(kakao.polylineInstances).toHaveLength(2));
    const walkingLine = kakao.polylineInstances[1];

    coordinates = { latitude: 35.86, longitude: 129.23 };
    fireEvent.click(screen.getByRole('button', { name: '현재 위치' }));
    await waitFor(() => expect(walkingLine.setMap).toHaveBeenCalledWith(null));
    await waitFor(() => expect(kakao.polylineInstances).toHaveLength(3));
    const refreshedLine = kakao.polylineInstances[2];

    // 다른 장소를 둘러봐도 이미 잡은 경로는 유지된다.
    view.rerender(
      <KakaoMapExplorer places={[secondPlace]} selectedPlace={secondPlace} onSelect={vi.fn()} />
    );
    await waitFor(() => expect(kakao.event.removeListener).toHaveBeenCalled());
    expect(refreshedLine.setMap).not.toHaveBeenCalledWith(null);

    // An explicit marker click changes the route; automatic prop changes do not.
    fireEvent.click(screen.getByRole('button', { name: '도착지 선택' }));
    view.rerender(
      <KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={vi.fn()} />
    );
    expect(refreshedLine.setMap).not.toHaveBeenCalledWith(null);
    const markerClick = kakao.listeners.findLast(entry => entry.target !== kakao.map && entry.type === 'click');
    act(() => markerClick?.listener());
    await waitFor(() => expect(refreshedLine.setMap).toHaveBeenCalledWith(null));
  });

  it('restores the route panel after GPS selects a destination, without nearby auto-selection overwriting it', async () => {
    installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(true);
    const gps = installPendingGeolocation();
    const onSelect = vi.fn();
    const nearby = vi.fn();
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true, json: async () => url.includes('/nearby?') ? { places: [secondPlace] } : comparisonPayload()
    }));
    const view = render(<KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={onSelect} onNearbyPlaces={nearby} />);
    fireEvent.click(await screen.findByRole('button', { name: '출발지 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '도착지 선택' }));
    expect(screen.queryByRole('button', { name: '출발지 선택' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '현재 위치 사용' }));
    await act(async () => gps.succeed());
    expect(screen.getByRole('button', { name: '도착지 선택' })).toHaveTextContent('현재 위치');
    await waitFor(() => expect(nearby).toHaveBeenCalledWith([secondPlace]));
    view.rerender(<KakaoMapExplorer places={[secondPlace]} selectedPlace={secondPlace} onSelect={onSelect} onNearbyPlaces={nearby} />);
    expect(screen.getByRole('button', { name: '출발지 선택' })).toHaveTextContent(firstPlace.name);
    expect(screen.getByRole('button', { name: '도착지 선택' })).toHaveTextContent('현재 위치');
  });

  it('keeps marker selection reachable and ignores automatic place changes while picking', async () => {
    const kakao = installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(true);
    const gps = installPendingGeolocation();
    const onSelect = vi.fn();
    fetchMock.mockResolvedValue({ ok: true, json: async () => comparisonPayload() });
    const view = render(<KakaoMapExplorer places={[firstPlace, secondPlace]} selectedPlace={firstPlace} onSelect={onSelect} />);
    fireEvent.click(await screen.findByRole('button', { name: '출발지 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '도착지 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '현재 위치 사용' }));
    view.rerender(<KakaoMapExplorer places={[firstPlace, secondPlace]} selectedPlace={secondPlace} onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: '취소' })).toBeVisible();
    const marker = kakao.markerInstances.findLast(instance => instance.setMap.mock.calls.some(([map]) => map === kakao.map));
    expect(marker).toBeDefined();
    const click = kakao.listeners.findLast(entry => entry.target === marker);
    // Simulate a queued GPS resolution followed by a marker tap in the same turn.
    await act(async () => { gps.succeed(); click?.listener(); });
    expect(gps.clearWatch).toHaveBeenCalledWith(1);
    expect(screen.getByRole('button', { name: '도착지 선택' })).toHaveTextContent(secondPlace.name);
    expect(screen.getByRole('button', { name: '출발지 선택' })).toHaveTextContent(firstPlace.name);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'change', 'swap', 'close', 'unmount'] as const)('discards queued GPS success after %s', async action => {
    const kakao = installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(true);
    const gps = installPendingGeolocation();
    const nearby = vi.fn();
    const close = vi.fn();
    const view = render(<KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={vi.fn()} onNearbyPlaces={nearby} onCloseRoute={close} />);
    fireEvent.click(await screen.findByRole('button', { name: '도착지 선택' }));
    if (action === 'cancel') {
      fireEvent.click(screen.getByRole('button', { name: '출발지 선택' }));
      fireEvent.click(screen.getByRole('button', { name: '현재 위치 사용' }));
    } else {
      fireEvent.click(screen.getByRole('button', { name: '현재 위치' }));
    }
    kakao.map.panTo.mockClear();
    await act(async () => {
      gps.succeed();
      if (action === 'cancel') fireEvent.click(screen.getByRole('button', { name: '취소' }));
      if (action === 'change') fireEvent.click(screen.getByRole('button', { name: '출발지 선택' }));
      if (action === 'swap') fireEvent.click(screen.getByRole('button', { name: '출발·도착 바꾸기' }));
      if (action === 'close') fireEvent.click(screen.getByRole('button', { name: '닫기' }));
      if (action === 'unmount') view.unmount();
    });
    expect(gps.clearWatch).toHaveBeenCalledWith(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(nearby).not.toHaveBeenCalled();
    expect(kakao.map.panTo).not.toHaveBeenCalled();
    if (action === 'cancel') expect(screen.getByRole('button', { name: '출발지 선택' })).toHaveTextContent('선택 안 됨');
    if (action === 'change') expect(screen.getByRole('button', { name: '취소' })).toBeVisible();
    if (action === 'swap') expect(screen.getByRole('button', { name: '출발지 선택' })).toHaveTextContent(firstPlace.name);
    if (action === 'close') expect(close).toHaveBeenCalledOnce();
  });

  it('cancels the watch and ignores a queued denial when selecting a map point', async () => {
    const kakao = installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(true);
    const gps = installPendingGeolocation();
    fetchMock.mockResolvedValue({ ok: true, json: async () => comparisonPayload() });
    render(<KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '도착지 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '출발지 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '현재 위치 사용' }));
    const click = kakao.listeners.find(entry => entry.target === kakao.map);
    await act(async () => {
      gps.fail();
      click?.listener({ latLng: { getLat: () => 35.84, getLng: () => 129.21 } });
    });
    expect(screen.getByRole('button', { name: '출발지 선택' })).toHaveTextContent('지도에서 선택한 지점');
    expect(screen.queryByText(/위치 권한이 거부/)).not.toBeInTheDocument();
    expect(gps.clearWatch).toHaveBeenCalledWith(1);
  });

  it('uses only the latest GPS request and aborts an unfinished older watch', async () => {
    const kakao = installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(true);
    const gps = installPendingGeolocation();
    render(<KakaoMapExplorer places={[]} onSelect={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '현재 위치' }));
    fireEvent.click(screen.getByRole('button', { name: '현재 위치' }));
    expect(gps.clearWatch).toHaveBeenCalledWith(1);
    await act(async () => { gps.succeed(1, 35.86); gps.succeed(0, 35.84); gps.fail(0); });
    expect(kakao.map.panTo).toHaveBeenCalledExactlyOnceWith({ lat: 35.86, lng: 129.2247 });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('discards a nearby response that arrives after the user begins selecting an endpoint', async () => {
    installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(true);
    installGeolocation(() => ({ latitude: 35.8562, longitude: 129.2247 }));
    const response = deferred<{ ok: boolean; json: () => Promise<{ places: Place[] }> }>();
    fetchMock.mockReturnValue(response.promise);
    const nearby = vi.fn();
    const loading = vi.fn();
    render(<KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={vi.fn()} onNearbyPlaces={nearby} onNearbyLoading={loading} />);
    fireEvent.click(await screen.findByRole('button', { name: '현재 위치' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: '도착지 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '출발지 선택' }));
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => response.resolve({ ok: true, json: async () => ({ places: [secondPlace] }) }));
    expect(nearby).not.toHaveBeenCalled();
    expect(loading).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: '취소' })).toBeVisible();
  });

  it('shows consent above the expanded route panel and preserves the requested GPS destination', async () => {
    installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(false);
    const gps = installPendingGeolocation();
    fetchMock.mockResolvedValue({ ok: true, json: async () => comparisonPayload() });
    render(<KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '출발지 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '현재 위치' }));
    const dialog = screen.getByRole('dialog', { name: '위치 동의' });
    expect(dialog).toHaveClass('z-[60]');
    fireEvent.click(within(dialog).getByRole('button', { name: '수동 탐색' }));
    fireEvent.click(screen.getByRole('button', { name: '도착지 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '현재 위치 사용' }));
    fireEvent.click(screen.getByRole('button', { name: '동의하고 위치 사용' }));
    await waitFor(() => expect(gps.watchPosition).toHaveBeenCalledOnce());
    await act(async () => gps.succeed());
    expect(screen.getByRole('button', { name: '출발지 선택' })).toHaveTextContent(firstPlace.name);
    expect(screen.getByRole('button', { name: '도착지 선택' })).toHaveTextContent('현재 위치');
  });

  it('does not start GPS after consent persistence completes for a cancelled selection', async () => {
    installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(false);
    const saved = deferred<boolean>();
    vi.mocked(saveLocationConsent).mockReturnValue(saved.promise);
    const gps = installPendingGeolocation();
    render(<KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '출발지 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '도착지 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '현재 위치 사용' }));
    fireEvent.click(screen.getByRole('button', { name: '동의하고 위치 사용' }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    await act(async () => saved.resolve(true));
    expect(gps.watchPosition).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '도착지 선택' })).toHaveTextContent('선택 안 됨');
  });

  it('ignores a late browser permission result after the user begins a manual selection', async () => {
    installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(true);
    const gps = installPendingGeolocation();
    const permission = deferred<{ state: PermissionState }>();
    const query = vi.fn().mockReturnValue(permission.promise);
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query } });
    render(<KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={vi.fn()} routeOpen />);
    await waitFor(() => expect(query).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: '출발지 선택' }));
    await act(async () => permission.resolve({ state: 'granted' }));
    expect(gps.watchPosition).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '취소' })).toBeVisible();
  });

  it('keeps GPS errors above the route panel and area search below the picking banner', async () => {
    installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(true);
    const gps = installPendingGeolocation();
    const searchArea = vi.fn();
    render(<KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={vi.fn()} onSearchArea={searchArea} />);
    fireEvent.click(await screen.findByRole('button', { name: '도착지 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '자동차' }));
    await act(async () => gps.fail());
    expect(screen.getByRole('status')).toHaveTextContent('위치 권한이 거부');
    expect(screen.getByRole('status').parentElement).toHaveClass('z-[60]');
    fireEvent.click(screen.getByRole('button', { name: '출발지 선택' }));
    const search = screen.getByRole('button', { name: '현 지도에서 검색' });
    expect(search).toHaveClass('top-20');
    fireEvent.click(search);
    expect(searchArea).toHaveBeenCalledWith({ south: 35.7, west: 129, north: 36, east: 129.4 });
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(search).toHaveClass('top-3');
  });

  it('shows when the traveler would arrive and moves the map to a chosen turn', async () => {
    const { map } = installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(true);
    installGeolocation(() => ({ latitude: 35.8562, longitude: 129.2247 }));
    fetchMock.mockResolvedValue({ ok: true, json: async () => comparisonPayload() });

    render(<KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '도착지 선택' }));
    fireEvent.click(await screen.findByRole('button', { name: '현재 위치' }));

    // 자동차 5분 뒤 도착 시각이 함께 보인다.
    const arrival = new Date(Date.now() + 300 * 1000).toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' });
    expect(await screen.findByText(new RegExp(`${arrival} 도착 예정`))).toBeVisible();

    const step = await screen.findByRole('button', { name: '1번 지점 지도에서 보기' });
    fireEvent.click(step);
    expect(map.panTo).toHaveBeenCalled();
  });

  it('lets the traveler zoom and return to their own location', async () => {
    const { map } = installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(true);
    installGeolocation(() => ({ latitude: 35.8562, longitude: 129.2247 }));
    render(<KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: '지도 확대' }));
    fireEvent.click(screen.getByRole('button', { name: '지도 축소' }));
    expect(map.setLevel).toHaveBeenCalledWith(4, { animate: true });
    expect(map.setLevel).toHaveBeenCalledWith(6, { animate: true });
    expect(screen.getByRole('button', { name: '현재 위치' })).toBeVisible();
  });

  it('refuses a location outside Gyeongju instead of routing from another city', async () => {
    installKakaoMock();
    vi.mocked(readLocationConsent).mockResolvedValue(true);
    // 서울 양천구: 여행자가 아직 경주에 도착하지 않은 상태
    installGeolocation(() => ({ latitude: 37.5266, longitude: 126.8562 }));
    render(<KakaoMapExplorer places={[firstPlace]} selectedPlace={firstPlace} onSelect={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: '현재 위치' }));

    expect(await screen.findByText(/경주 밖이라/)).toBeVisible();
    // 주변 관광지도, 경로 비교도 요청하지 않는다.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

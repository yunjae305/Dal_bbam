// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '@/shared/types';
import { MapPageScreen } from '@/frontend/components/travel/map-page-screen';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams()
}));

vi.mock('@/frontend/i18n/locale-context', () => ({
  useLocale: () => ({
    locale: 'ko',
    messages: {
      common: { searchPlaceholder: '장소 검색', all: '전체', empty: '없음' },
      categories: {
        heritage: '문화유산', attraction: '관광지', food: '맛집', lodging: '숙박',
        festival: '축제', nature: '자연', experience: '체험'
      },
      map: {
        title: '경주 지도', nearbyLoading: '주변 검색 중', nearbyCount: '{count}곳',
        kakaoSearching: '카카오 검색 중', kakaoCount: '카카오 {count}곳',
        kakaoSearchFailed: '검색 실패', kakaoSearch: '카카오 장소 검색',
        kakaoDetail: '카카오맵 상세'
      }
    }
  })
}));

vi.mock('@/frontend/components/travel/kakao-map-explorer', () => ({
  KakaoMapExplorer: ({ onSearchArea }: { onSearchArea?: (bounds: { south: number; west: number; north: number; east: number }) => void }) => (
    <button type="button" onClick={() => onSearchArea?.({ south: 35.7, west: 129, north: 36, east: 129.4 })}>
      현 지도에서 검색
    </button>
  )
}));

const place: Place = {
  id: 'tour-1',
  contentId: 'tour-1',
  category: 'heritage',
  name: '첨성대',
  description: '신라 천문대',
  address: '경북 경주시',
  distance: '',
  rating: 4.8,
  bestTime: '',
  image: '/test.jpg',
  tags: ['신라'],
  coordinates: [35.8347, 129.2191],
  translations: {}
};

const kakaoPayload = {
  data: {
    places: [{
      id: '123',
      name: '카카오 불국사',
      categoryName: '여행 > 관광명소',
      categoryGroupCode: 'AT4',
      categoryGroupName: '관광명소',
      phone: '',
      address: '경북 경주시',
      roadAddress: '',
      lat: 35.79,
      lng: 129.33,
      placeUrl: 'https://place.map.kakao.com/123',
      distanceMeters: 120
    }]
  }
};

describe('MapPageScreen Kakao search', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => kakaoPayload });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('submits a Kakao keyword search and renders place_url', async () => {
    render(<MapPageScreen places={[place]} />);
    fireEvent.change(screen.getByLabelText('장소 검색'), { target: { value: '불국사' } });
    fireEvent.click(screen.getByRole('button', { name: '카카오 장소 검색' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/maps/places?');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('query=%EB%B6%88%EA%B5%AD%EC%82%AC');
    expect(await screen.findByRole('link', { name: /카카오맵 상세/ })).toHaveAttribute(
      'href',
      'https://place.map.kakao.com/123'
    );
  });

  it('maps the food filter to the Kakao FD6 category endpoint', async () => {
    render(<MapPageScreen places={[place]} />);
    fireEvent.click(screen.getByRole('button', { name: '맛집' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('category=FD6');
  });

  it.each(['자연', '축제', '문화유산', '체험'])('does not relabel generic Kakao attractions as the selected %s category', async category => {
    render(<MapPageScreen places={[place]} />);
    fireEvent.click(screen.getByRole('button', { name: category }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('카카오 검색 중')).not.toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /카카오맵 상세/ })).not.toBeInTheDocument();
  });

  it('keeps nature search results whose provider category actually identifies a natural site', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { places: [{ ...kakaoPayload.data.places[0], name: '카카오 자연공원', categoryName: '여행 > 관광명소 > 자연 > 국립공원' }] } }) });
    render(<MapPageScreen places={[place]} />);
    fireEvent.click(screen.getByRole('button', { name: '자연' }));
    expect(await screen.findByRole('link', { name: /카카오맵 상세/ })).toBeInTheDocument();
    expect(screen.getByText('카카오 자연공원')).toBeInTheDocument();
  });

  it('passes the visible Kakao map bounds to the server search', async () => {
    render(<MapPageScreen places={[place]} />);
    fireEvent.click(screen.getByRole('button', { name: '현 지도에서 검색' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('south=35.7');
    expect(url).toContain('west=129');
    expect(url).toContain('north=36');
    expect(url).toContain('east=129.4');
  });

  it('labels a Kakao business with the provider category instead of calling it an attraction', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { places: [{
      ...kakaoPayload.data.places[0], id: '456', name: '강산불국사지게차',
      categoryName: '가정,생활 > 개인,가정용품수리 > 지게차수리', categoryGroupCode: '', categoryGroupName: ''
    }] } }) });
    render(<MapPageScreen places={[place]} />);
    fireEvent.change(screen.getByLabelText('장소 검색'), { target: { value: '불국사' } });
    fireEvent.click(screen.getByRole('button', { name: '카카오 장소 검색' }));

    expect(await screen.findByText(/지게차수리 · 경북 경주시/)).toBeInTheDocument();
    expect(screen.queryByText(/관광지 · 경북 경주시/)).not.toBeInTheDocument();
  });
});

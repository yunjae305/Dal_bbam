// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShortsScreen } from '@/frontend/components/travel/shorts-screen';
import type { ShortItem } from '@/shared/types';

const mocks = vi.hoisted(() => ({
  player: vi.fn((props: { item: { id: string }; active: boolean; autoPlay: boolean }) => {
    void props;
    return null;
  })
}));

vi.mock('@/frontend/components/travel/short-video-player', () => ({
  ShortVideoPlayer: mocks.player
}));
vi.mock('@/frontend/components/travel/visitor-stories', () => ({ VisitorStories: () => null }));
vi.mock('@/frontend/i18n/locale-context', () => ({
  useLocale: () => ({
    locale: 'ko',
    messages: {
      common: { all: '전체', save: '저장', share: '공유' },
      ai: { pause: '해설 멈춤', listen: '해설 듣기', disclosure: 'AI 해설' }
    }
  })
}));

const items: ShortItem[] = ['first', 'second'].map((id, index) => ({
  id,
  contentId: `place-${index}`,
  title: `쇼츠 ${index + 1}`,
  summary: '요약',
  narration: '내레이션',
  imageUrl: '/poster.jpg',
  videoUrl: `/shorts/${id}.mp4`,
  durationSeconds: 60,
  tags: ['야경'],
  liked: false,
  saved: false,
  likeCount: 0,
  isAiGenerated: true
}));

describe('ShortsScreen viewport playback', () => {
  let notifyIntersection: IntersectionObserverCallback;

  beforeEach(() => {
    mocks.player.mockClear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: items })
    }));
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) {
        notifyIntersection = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
      root = null;
      rootMargin = '';
      thresholds = [];
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('activates only the most visible card and enables autoplay', async () => {
    render(<ShortsScreen />);
    await screen.findByText('쇼츠 2');
    await waitFor(() => expect(notifyIntersection).toBeTypeOf('function'));

    const first = document.querySelector<HTMLElement>('[data-short-id="first"]');
    const second = document.querySelector<HTMLElement>('[data-short-id="second"]');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    act(() => notifyIntersection([
      { target: first, isIntersecting: true, intersectionRatio: 0.2 },
      { target: second, isIntersecting: true, intersectionRatio: 0.8 }
    ] as unknown as IntersectionObserverEntry[], {} as IntersectionObserver));

    await waitFor(() => {
      const latest = new Map(mocks.player.mock.calls.map(([props]) => [props.item.id, props]));
      expect(latest.get('first')).toMatchObject({ active: false, autoPlay: true });
      expect(latest.get('second')).toMatchObject({ active: true, autoPlay: true });
    });
  });

  it('retains every available tag after applying a filter', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ data: [items[0]], meta: { tags: ['야경', '역사'] } }) } as Response);
    render(<ShortsScreen />);
    fireEvent.click(await screen.findByRole('button', { name: '#역사' }));
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining('tag='), expect.anything()));
    expect(await screen.findByRole('button', { name: '#역사' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { name: '#야경' }).length).toBeGreaterThan(0);
  });

  it('plays finished MP4 and YouTube stories without offering generated narration', async () => {
    const videoItems = [items[0], { ...items[1], videoUrl: undefined, youtubeVideoId: 'dQw4w9WgXcQ' }];
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ data: videoItems }) } as Response);
    render(<ShortsScreen />);
    await screen.findByText('쇼츠 2');
    expect(screen.queryByRole('button', { name: '해설 듣기' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '쇼츠 1 · 장소 정보 보기' })).toHaveAttribute('href', '/places/place-0');
    expect(screen.getByRole('link', { name: '쇼츠 2 · 장소 정보 보기' })).toHaveAttribute('href', '/places/place-1');
    expect(vi.mocked(fetch).mock.calls.every(([url]) => !String(url).includes('/api/ai/'))).toBe(true);
  });

  it('keeps narration available for image stories and explicitly supplied video audio', async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    const sources: string[] = [];
    vi.stubGlobal('Audio', class {
      constructor(source: string) { sources.push(source); }
      play = play;
      pause = pause;
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({
      data: [{ ...items[0], videoUrl: undefined }, { ...items[1], audioUrl: '/audio/recorded-introduction.mp3' }]
    }) } as Response);
    render(<ShortsScreen />);
    await screen.findByText('쇼츠 2');
    const controls = screen.getAllByRole('button', { name: '해설 듣기' });
    expect(controls).toHaveLength(2);
    fireEvent.click(controls[1]);
    await waitFor(() => expect(play).toHaveBeenCalledOnce());
    expect(sources).toEqual(['/audio/recorded-introduction.mp3']);
    expect(screen.getByRole('button', { name: '해설 멈춤' })).toBeInTheDocument();
  });

  it('appends the next page without duplicating cards already in the feed', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [items[0]], meta: { nextOffset: 10 } }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: items, meta: { nextOffset: null } }) } as Response);
    render(<ShortsScreen />);
    fireEvent.click(await screen.findByRole('button', { name: '쇼츠 더 보기' }));
    await screen.findByText('쇼츠 2');
    expect(screen.getAllByText('쇼츠 1')).toHaveLength(1);
    expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining('offset=10'), expect.anything());
    expect(screen.queryByRole('button', { name: '쇼츠 더 보기' })).not.toBeInTheDocument();
  });

  it('keeps existing cards and allows retry when loading another page fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [items[0]], meta: { nextOffset: 10 } }) } as Response)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [items[1]], meta: { nextOffset: null } }) } as Response);
    render(<ShortsScreen />);
    fireEvent.click(await screen.findByRole('button', { name: '쇼츠 더 보기' }));
    await screen.findByRole('alert');
    expect(screen.getByText('쇼츠 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '쇼츠 더 보기' }));
    await screen.findByText('쇼츠 2');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

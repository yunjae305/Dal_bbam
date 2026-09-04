// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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
});

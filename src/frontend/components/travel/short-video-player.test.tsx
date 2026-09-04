// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShortVideoPlayer } from '@/frontend/components/travel/short-video-player';
import type { ShortItem } from '@/shared/types';

const baseItem: ShortItem = {
  id: 'short-1',
  contentId: 'place-1',
  title: '경주 야경',
  summary: '요약',
  narration: '내레이션',
  imageUrl: '/poster.jpg',
  durationSeconds: 58,
  tags: [],
  liked: false,
  saved: false,
  likeCount: 0,
  isAiGenerated: true
};

describe('ShortVideoPlayer', () => {
  let play: ReturnType<typeof vi.spyOn>;
  let pause: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('autoplays an active MP4 and pauses it outside the viewport', async () => {
    const item = { ...baseItem, videoUrl: 'https://cdn.example/night.mp4' };
    const { rerender, container } = render(<ShortVideoPlayer item={item} active autoPlay />);
    const video = container.querySelector('video');

    expect(video).toHaveAttribute('src', item.videoUrl);
    expect(video).toHaveAttribute('poster', item.imageUrl);
    expect(video).toHaveAttribute('playsinline');
    await waitFor(() => expect(play).toHaveBeenCalled());

    rerender(<ShortVideoPlayer item={item} active={false} autoPlay />);
    await waitFor(() => expect(pause).toHaveBeenCalled());
  });

  it('uses a privacy-enhanced YouTube embed for a normalized ID', () => {
    render(<ShortVideoPlayer item={{ ...baseItem, youtubeVideoId: 'dQw4w9WgXcQ' }} active autoPlay />);
    const frame = screen.getByTitle('경주 야경 YouTube 영상');
    expect(frame).toHaveAttribute('src', expect.stringContaining('youtube-nocookie.com/embed/dQw4w9WgXcQ'));
    expect(frame).toHaveAttribute('src', expect.stringContaining('enablejsapi=1'));
  });

  it('falls back when the YouTube player reports an unavailable video', () => {
    render(<ShortVideoPlayer item={{ ...baseItem, youtubeVideoId: 'dQw4w9WgXcQ' }} active autoPlay />);
    const frame = screen.getByTitle('경주 야경 YouTube 영상') as HTMLIFrameElement;
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'https://www.youtube-nocookie.com',
        source: frame.contentWindow,
        data: JSON.stringify({ event: 'onError', info: 101 })
      }));
    });

    expect(screen.getByRole('status')).toHaveTextContent('대표 이미지');
    expect(screen.queryByTitle('경주 야경 YouTube 영상')).not.toBeInTheDocument();
  });

  it('falls back accessibly to the poster after an MP4 error', () => {
    const { container } = render(
      <ShortVideoPlayer item={{ ...baseItem, videoUrl: '/shorts/missing.mp4' }} active autoPlay />
    );
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    fireEvent.error(video as HTMLVideoElement);

    expect(screen.getByRole('img', { name: baseItem.title })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('대표 이미지');
  });

  it('keeps an image-only legacy short free of video controls', () => {
    render(<ShortVideoPlayer item={baseItem} active autoPlay />);
    expect(screen.getByRole('img', { name: baseItem.title })).toBeVisible();
    expect(screen.queryByRole('button', { name: '영상 재생' })).not.toBeInTheDocument();
  });
});

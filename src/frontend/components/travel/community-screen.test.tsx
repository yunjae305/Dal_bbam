// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/shared/i18n';
import { CommunityScreen } from './community-screen';

vi.mock('@/frontend/i18n/locale-context', () => ({ useLocale: () => ({ locale: 'ko', messages: messages.ko }) }));

const post = { id: 'post-1', category: 'tip', title: '황남동 식당 팁', content: '일찍 방문하세요.', authorName: '여행자', mediaUrls: [], bookmarked: true, contentId: '123', placeName: '식당', placeAddress: '경주시 황남동', placeCategory: 'food', createdAt: '2026-09-06', updatedAt: '2026-09-06' };

describe('community filtered feeds', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => ({ ok: true, json: async () => ({ data: String(input).includes('/bookmark') ? { bookmarked: false } : [post] }) }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('combines tip, district, and place-category selection in the feed request', async () => {
    render(<CommunityScreen />);
    await screen.findByRole('heading', { name: post.title });
    fireEvent.click(screen.getByRole('button', { name: '꿀팁' }));
    fireEvent.change(screen.getByRole('combobox', { name: '장소 종류' }), { target: { value: 'food' } });
    fireEvent.change(screen.getByPlaceholderText('지역·읍·면·동 (예: 황남동)'), { target: { value: '황남동' } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => {
      const query = new URL(String(input), 'http://localhost').searchParams;
      return query.get('category') === 'tip' && query.get('region') === '황남동' && query.get('placeCategory') === 'food';
    })).toBe(true));
  });

  it('removes an unbookmarked post from the saved-only feed after persistence succeeds', async () => {
    render(<CommunityScreen />);
    await screen.findByRole('heading', { name: post.title });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('bookmarked=true'))).toBe(true));
    await screen.findByRole('heading', { name: post.title });
    fireEvent.click(screen.getByRole('button', { name: '북마크 해제' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: post.title })).not.toBeInTheDocument());
    const request = fetchMock.mock.calls.find(([url]) => String(url).includes('/bookmark'));
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ bookmarked: false });
  });
});

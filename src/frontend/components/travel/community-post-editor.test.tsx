// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommunityPost } from '@/shared/types';
import { CommunityPostEditor } from '@/frontend/components/travel/community-post-editor';

vi.mock('@/frontend/i18n/locale-context', () => ({
  useLocale: () => ({
    locale: 'ko',
    messages: { community: { explicitPublish: '초안을 확인한 뒤 게시해 주세요.' } }
  })
}));

vi.mock('@/frontend/supabase/client', () => ({ createSupabaseBrowserClient: vi.fn(() => null) }));

const savedPost: CommunityPost = {
  id: 'post-1',
  category: 'tip',
  title: '경주 꿀팁',
  content: '아침에 방문해 보세요.',
  mediaUrls: [],
  authorName: '여행자',
  bookmarked: false,
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z'
};

describe('CommunityPostEditor payload', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/health') {
        return { ok: true, json: async () => ({ readiness: { ai: true } }) };
      }
      return { ok: true, json: async () => ({ data: savedPost }) };
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('omits rating when creating a tip post', async () => {
    const onSaved = vi.fn();
    render(<CommunityPostEditor onClose={vi.fn()} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole('button', { name: '꿀팁' }));
    fireEvent.change(screen.getByPlaceholderText('제목을 입력해 주세요'), { target: { value: '경주 꿀팁' } });
    fireEvent.change(screen.getByPlaceholderText('경주 여행 이야기를 들려주세요'), {
      target: { value: '아침에 방문해 보세요.' }
    });
    await waitFor(() => expect(screen.getByRole('button', { name: '게시하기' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '게시하기' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(savedPost));
    const request = fetchMock.mock.calls.find(([url]) => url === '/api/community');
    expect(request).toBeDefined();
    const body = JSON.parse(String(request?.[1]?.body));
    expect(body).toMatchObject({ category: 'tip', title: '경주 꿀팁', content: '아침에 방문해 보세요.' });
    expect(body).not.toHaveProperty('rating');
  });

  it('sends a null rating when changing an existing post to tip', async () => {
    const original: CommunityPost = { ...savedPost, category: 'review', rating: 5 };
    const onSaved = vi.fn();
    render(<CommunityPostEditor post={original} onClose={vi.fn()} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole('button', { name: '꿀팁' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '수정 내용 저장' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '수정 내용 저장' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const request = fetchMock.mock.calls.find(([url]) => url === '/api/community/post-1');
    expect(request).toBeDefined();
    expect(request?.[1]).toMatchObject({ method: 'PATCH' });
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({ category: 'tip', rating: null });
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommunityPost } from '@/shared/types';
import { CommunityPostEditor } from '@/frontend/components/travel/community-post-editor';

const { uploadToSignedUrl } = vi.hoisted(() => ({ uploadToSignedUrl: vi.fn() }));

vi.mock('@/frontend/i18n/locale-context', () => ({
  useLocale: () => ({
    locale: 'ko',
    messages: { community: { explicitPublish: '초안을 확인한 뒤 게시해 주세요.' } }
  })
}));

vi.mock('@/frontend/supabase/client', () => ({ createSupabaseBrowserClient: () => ({ storage: { from: () => ({ uploadToSignedUrl }) } }) }));

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
    uploadToSignedUrl.mockResolvedValue({ error: null });
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/health') {
        return { ok: true, json: async () => ({ readiness: { ai: true } }) };
      }
      if (String(input).startsWith('/api/places?')) {
        return { ok: true, json: async () => ({ data: [{ contentId: 'food-1', name: '경주 식당', category: 'food' }, { contentId: 'lodging-1', name: '경주 숙소', category: 'lodging' }] }) };
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

  it('requires a matching TourAPI place before publishing a restaurant review', async () => {
    const onSaved = vi.fn();
    render(<CommunityPostEditor onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: '맛집' }));
    fireEvent.change(screen.getByPlaceholderText('제목을 입력해 주세요'), { target: { value: '식당 후기' } });
    fireEvent.change(screen.getByPlaceholderText('경주 여행 이야기를 들려주세요'), { target: { value: '맛있었어요.' } });
    await screen.findByRole('option', { name: '경주 식당' });
    expect(screen.queryByRole('option', { name: '경주 숙소' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '게시하기' })).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'food-1' } });
    fireEvent.click(screen.getByRole('button', { name: '게시하기' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const request = fetchMock.mock.calls.find(([url]) => url === '/api/community');
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({ category: 'food', contentId: 'food-1', rating: 5 });
  });

  it('uses the detail-page place as the review target', async () => {
    const onSaved = vi.fn();
    render(<CommunityPostEditor initialPlace={{ contentId: 'lodging-1', name: '경주 숙소', category: 'lodging' }} onClose={vi.fn()} onSaved={onSaved} />);
    await screen.findByRole('option', { name: '경주 숙소' });
    expect(screen.getByRole('combobox')).toHaveValue('lodging-1');
    expect(screen.getByRole('button', { name: '숙소' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('automatically creates an editable photo story and waits for explicit publication', async () => {
    const onSaved = vi.fn();
    const baseline = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/community/uploads/sign') return { ok: true, json: async () => ({ data: { mediaId: 'media-1', path: 'staged.jpg', token: 'token' } }) };
      if (url === '/api/community/uploads/complete') return { ok: true, json: async () => ({ data: { mediaId: 'media-1', url: 'https://example.com/photo.jpg', privacyCheck: 'completed' } }) };
      if (url === '/api/community/story') return { ok: true, json: async () => ({ data: { title: '사진으로 만든 이야기', content: '문화재 앞에서 보낸 하루' } }) };
      return baseline(input, init);
    });
    const { container } = render(<CommunityPostEditor onClose={vi.fn()} onSaved={onSaved} />);
    await screen.findByRole('option', { name: '경주 숙소' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(screen.getByPlaceholderText('제목을 입력해 주세요')).toHaveValue('사진으로 만든 이야기'));
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/community')).toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '게시하기' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const request = fetchMock.mock.calls.find(([url]) => url === '/api/community');
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({ mediaIds: ['media-1'], title: '사진으로 만든 이야기' });
  });
});

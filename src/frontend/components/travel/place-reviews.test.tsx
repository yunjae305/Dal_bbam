// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaceReviews } from './place-reviews';
import { messages } from '@/shared/i18n';

vi.mock('@/frontend/i18n/locale-context', () => ({ useLocale: () => ({ locale: 'ko', messages: messages.ko }) }));
vi.mock('./community-post-editor', () => ({ CommunityPostEditor: ({ initialPlace }: { initialPlace: { contentId: string; category: string } }) => <div role="dialog">{initialPlace.contentId} {initialPlace.category}</div> }));

describe('place detail reviews', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('shows linked text reviews, computes the rating average, and starts a place-linked review', async () => {
    const post = { id: 'review-1', category: 'food', title: '맛집 후기', content: '좋은 식사였어요.', rating: 4, authorName: '방문자', mediaUrls: [], createdAt: '2026-09-06' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [post, { ...post, id: 'review-2', title: '또 다른 후기', rating: 2 }, { ...post, id: 'tip', category: 'tip', title: '평점 없는 꿀팁' }] }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<PlaceReviews place={{ contentId: 'tour-123', name: '경주 식당', category: 'food' }} />);
    await screen.findByRole('heading', { name: '맛집 후기' });
    expect(screen.getByText(/평균 3.0점/)).toBeInTheDocument();
    expect(screen.queryByText('평점 없는 꿀팁')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/community?contentId=tour-123', expect.anything());
    fireEvent.click(screen.getByRole('button', { name: '리뷰 작성' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('tour-123 food');
  });
});

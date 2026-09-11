// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { communityCopy } from '@/shared/community';
import { languages } from '@/shared/types';
import { VisitorStories } from './visitor-stories';

const state = vi.hoisted(() => ({ locale: 'ko' }));
vi.mock('@/frontend/i18n/locale-context', () => ({ useLocale: () => ({ locale: state.locale }) }));

describe('visitor photo story feed', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it.each(languages)('renders its empty state in %s and offers the community creation path', async locale => {
    state.locale = locale;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }));
    render(<VisitorStories />);
    const action = await screen.findByRole('link', { name: communityCopy[locale].storiesEmpty });
    expect(action).toHaveAttribute('href', '/community');
    expect(screen.getByRole('heading', { name: communityCopy[locale].stories })).toBeInTheDocument();
  });

  it('links the photo story to its published post and lets the traveler refresh', async () => {
    state.locale = 'ko';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 'post-1', title: '첨성대의 아침', content: '사진으로 남긴 여행', mediaUrls: ['https://example.com/photo.jpg'], placeName: '첨성대', authorName: '여행자', createdAt: '2026-09-06' }] }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<VisitorStories />);
    await screen.findByRole('heading', { name: '첨성대의 아침' });
    expect(screen.getByRole('link')).toHaveAttribute('href', '/community/post-1');
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/photo.jpg');
    fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminShortItem } from '@/shared/admin-shorts';
import { shortsAdminMessages } from '@/shared/shorts-admin-messages';
import type { Lang, Place } from '@/shared/types';
import { ShortsEditor } from './shorts-editor';

const state = vi.hoisted(() => ({ locale: 'ko' as Lang }));
vi.mock('@/frontend/i18n/locale-context', () => ({ useLocale: () => ({ locale: state.locale }) }));

const place: Place = {
  id: 'place-1', contentId: 'tour-1', category: 'heritage', name: '첨성대', description: '', address: '경주시',
  distance: '', rating: 0, bestTime: '', image: '', tags: [], coordinates: [35.83, 129.22], translations: {}
};
const short: AdminShortItem = {
  id: 'aa6238dd-81be-4b29-b7a9-a16394e5a2a5', contentId: 'tour-1', title: '첨성대의 인사', summary: '첨성대 캐릭터 소개',
  narration: '', lang: 'ko', imageUrl: null, audioUrl: null, videoUrl: '/videos/cheomseongdae.mp4', youtubeVideoId: null,
  durationSeconds: 45, tags: ['문화유산'], isPublished: false, isAiGenerated: false,
  createdAt: '2026-09-06T00:00:00Z', updatedAt: '2026-09-06T00:00:00Z'
};
const response = (data: unknown, meta: unknown = { nextOffset: null }) => ({ ok: true, json: async () => ({ data, meta }) });

async function start(rows: AdminShortItem[] = [], meta?: { nextOffset: number | null }) {
  const fetchMock = vi.fn().mockResolvedValue(response(rows, meta));
  vi.stubGlobal('fetch', fetchMock);
  const result = render(<ShortsEditor places={[place]} />);
  await waitFor(() => expect(screen.getByRole('button', { name: shortsAdminMessages[state.locale].newVideo })).toBeEnabled());
  return { ...result, fetchMock };
}

function fillNewVideo() {
  const ui = shortsAdminMessages[state.locale];
  fireEvent.change(screen.getByLabelText(ui.title), { target: { value: '첨성대의 인사' } });
  fireEvent.change(screen.getByLabelText(ui.summary), { target: { value: '첨성대 캐릭터 소개' } });
  fireEvent.change(screen.getByLabelText(ui.videoUrl, { exact: false, selector: 'input' }), { target: { value: '/videos/cheomseongdae.mp4' } });
}

describe('prepared heritage video administration', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); state.locale = 'ko'; });

  it.each(['ko', 'en', 'ja', 'zh'] as const)('provides the complete editor in %s', async lang => {
    state.locale = lang;
    await start();
    const ui = shortsAdminMessages[lang];
    expect(screen.getByRole('heading', { name: ui.heading })).toBeInTheDocument();
    expect(screen.getByLabelText(ui.transcript, { exact: false, selector: 'textarea' })).not.toBeRequired();
    expect(screen.getByRole('button', { name: ui.saveDraft })).toBeInTheDocument();
    expect(Object.keys(ui)).toEqual(Object.keys(shortsAdminMessages.ko));
    expect(Object.values(ui).every(value => value.trim().length > 0)).toBe(true);
  });

  it('creates a draft with selected language, optional transcript, tags and video metadata', async () => {
    const { fetchMock } = await start();
    fillNewVideo();
    fireEvent.change(screen.getByLabelText('영상 언어'), { target: { value: 'en' } });
    fireEvent.change(screen.getByLabelText('영상 길이 (초)'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('태그', { exact: false, selector: 'input' }), { target: { value: 'culture, introduction' } });
    const saved = { ...short, lang: 'en' as const, tags: ['culture', 'introduction'] };
    fetchMock.mockResolvedValueOnce(response(saved)).mockResolvedValueOnce(response([saved]));
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await screen.findByText('영상이 저장되었습니다.');
    const [url, options] = fetchMock.mock.calls.findLast(([, options]) => options?.method === 'POST')!;
    expect(url).toBe('/api/admin/shorts');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      contentId: 'tour-1', lang: 'en', title: short.title, summary: short.summary, narration: '', imageUrl: null,
      durationSeconds: 45, tags: ['culture', 'introduction'], videoUrl: short.videoUrl, youtubeVideoId: null, isPublished: false
    });
    expect(screen.getByRole('button', { name: '변경 저장' })).toBeInTheDocument();
    expect(within(screen.getByRole('article')).getByText('초안')).toBeInTheDocument();
  });

  it('edits existing metadata and preserves its published state until the response arrives', async () => {
    const { fetchMock } = await start([{ ...short, isPublished: true, lang: 'ja', narration: '既存の台本' }]);
    fireEvent.click(screen.getByRole('button', { name: '편집' }));
    expect(screen.getByLabelText('영상 언어')).toHaveValue('ja');
    expect(screen.getByLabelText('영상 대본 (선택)', { exact: false, selector: 'textarea' })).toHaveValue('既存の台本');
    fireEvent.change(screen.getByLabelText('영상 제목'), { target: { value: '새 소개' } });
    const saved = { ...short, isPublished: true, lang: 'ja' as const, title: '새 소개' };
    fetchMock.mockResolvedValueOnce(response(saved)).mockResolvedValueOnce(response([saved]));
    fireEvent.click(screen.getByRole('button', { name: '변경 저장' }));
    await screen.findByText('영상이 저장되었습니다.');
    expect(JSON.parse(fetchMock.mock.calls.findLast(([, options]) => options?.method === 'PATCH')![1].body)).toMatchObject({ shortId: short.id, title: '새 소개', lang: 'ja', isPublished: true, narration: '既存の台本' });
    expect(within(screen.getByRole('article')).getByRole('heading', { name: '새 소개' })).toBeInTheDocument();
  });

  it.each([false, true])('edits an existing narrated poster and preserves audio (clear video: %s)', async clearVideo => {
    const legacy = { ...short, imageUrl: '/images/heritage.webp', narration: '첨성대 이야기', audioUrl: '/audio/heritage.mp3', videoUrl: clearVideo ? short.videoUrl : null };
    const { fetchMock, container } = await start([legacy]);
    fireEvent.click(screen.getByRole('button', { name: '편집' }));
    const videoInput = screen.getByLabelText('영상 URL', { exact: false, selector: 'input' });
    expect(videoInput).not.toBeRequired();
    if (clearVideo) fireEvent.change(videoInput, { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('영상 제목'), { target: { value: '수정한 해설 제목' } });
    const saved = { ...legacy, title: '수정한 해설 제목', videoUrl: null };
    fetchMock.mockResolvedValueOnce(response(saved)).mockResolvedValueOnce(response([saved]));
    fireEvent.click(screen.getByRole('button', { name: '변경 저장' }));
    await screen.findByText('영상이 저장되었습니다.');
    await waitFor(() => expect(screen.getByRole('button', { name: '변경 저장' })).toBeEnabled());
    const body = JSON.parse(fetchMock.mock.calls.findLast(([, options]) => options?.method === 'PATCH')![1].body);
    expect(body).toMatchObject({ shortId: short.id, title: saved.title, imageUrl: legacy.imageUrl, narration: legacy.narration, videoUrl: null, youtubeVideoId: null });
    expect(body).not.toHaveProperty('audioUrl');
    expect(screen.getByLabelText('영상 제목')).toHaveValue(saved.title);
    fireEvent.click(screen.getByRole('button', { name: '영상 미리보기' }));
    expect(screen.getByRole('alert')).toHaveTextContent(shortsAdminMessages.ko.invalidVideo);
    expect(container.querySelector('video, iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '새 영상' }));
    expect(screen.getByLabelText('영상 URL', { exact: false, selector: 'input' })).toBeRequired();
  });

  it('publishes and unpublishes only after successful persistence and keeps state on failure', async () => {
    const { fetchMock } = await start([short]);
    let resolvePublish!: (value: ReturnType<typeof response>) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { resolvePublish = resolve; }));
    fetchMock.mockResolvedValueOnce(response([{ ...short, isPublished: true }]));
    fireEvent.click(screen.getByRole('button', { name: '공개' }));
    expect(within(screen.getByRole('article')).getByText('초안')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '공개' })).toBeDisabled();
    await act(async () => resolvePublish(response({ ...short, isPublished: true })));
    expect(within(screen.getByRole('article')).getByText('공개 중')).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls.findLast(([, options]) => options?.method === 'PATCH')![1].body)).toEqual({ shortId: short.id, isPublished: true });

    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: '저장 실패' } }) });
    fireEvent.click(screen.getByRole('button', { name: '비공개로 전환' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('저장 실패');
    expect(within(screen.getByRole('article')).getByText('공개 중')).toBeInTheDocument();
    expect(screen.queryByText('영상을 비공개 초안으로 전환했습니다.')).not.toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(response(short)).mockResolvedValueOnce(response([short]));
    fireEvent.click(screen.getByRole('button', { name: '비공개로 전환' }));
    await screen.findByText('영상을 비공개 초안으로 전환했습니다.');
    expect(within(screen.getByRole('article')).getByText('초안')).toBeInTheDocument();
  });

  it('loads MP4 and YouTube players only after a deliberate preview action', async () => {
    const { container } = await start();
    fillNewVideo();
    expect(container.querySelector('video, iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '영상 미리보기' }));
    const video = container.querySelector('video');
    expect(video).toHaveAttribute('src', short.videoUrl);
    expect(video).toHaveAttribute('controls');
    expect(video).not.toHaveAttribute('autoplay');
    fireEvent.error(video!);
    expect(screen.getByRole('alert')).toHaveTextContent('영상을 불러오지 못했습니다.');
    fireEvent.change(screen.getByLabelText('영상 URL', { exact: false, selector: 'input' }), { target: { value: 'https://youtu.be/abcdefghijk' } });
    expect(container.querySelector('video, iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '영상 미리보기' }));
    expect(screen.getByTitle('영상 미리보기')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/abcdefghijk?playsinline=1&rel=0');
    fireEvent.click(screen.getByRole('button', { name: '미리보기 닫기' }));
    expect(container.querySelector('video, iframe')).toBeNull();
  });

  it('rejects unsafe previews and excessive tags before requesting persistence', async () => {
    const { fetchMock, container } = await start();
    fillNewVideo();
    fireEvent.change(screen.getByLabelText('영상 URL', { exact: false, selector: 'input' }), { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: '영상 미리보기' }));
    expect(screen.getByRole('alert')).toHaveTextContent(shortsAdminMessages.ko.invalidVideo);
    expect(container.querySelector('video, iframe')).toBeNull();
    fillNewVideo();
    fireEvent.change(screen.getByLabelText('태그', { exact: false, selector: 'input' }), { target: { value: '1,2,3,4,5,6,7' } });
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent(shortsAdminMessages.ko.invalidTags);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a poster without an app path or HTTPS address and preserves form values on a failed save', async () => {
    const { fetchMock } = await start();
    fillNewVideo();
    fireEvent.change(screen.getByLabelText('포스터 URL (선택)', { exact: false, selector: 'input' }), { target: { value: 'poster.png' } });
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent(shortsAdminMessages.ko.invalidPoster);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('포스터 URL (선택)', { exact: false, selector: 'input' }), { target: { value: '/images/heritage.webp' } });
    fetchMock.mockRejectedValueOnce(new Error('네트워크 실패'));
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 실패');
    expect(screen.getByLabelText('영상 제목')).toHaveValue(short.title);
    expect(screen.getByRole('button', { name: '초안 저장' })).toBeEnabled();
    expect(screen.queryByText('영상이 저장되었습니다.')).not.toBeInTheDocument();
  });

  it('paginates private drafts and can recover from an initial list failure', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: '목록 실패' } }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<ShortsEditor places={[place]} />);
    await screen.findByText('목록 실패');
    fetchMock.mockResolvedValueOnce(response([short], { nextOffset: 20 }));
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    await screen.findByRole('heading', { name: short.title });
    fetchMock.mockResolvedValueOnce(response([{ ...short, id: 'short-2', title: '불국사 소개' }], { nextOffset: null }));
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    await screen.findByRole('heading', { name: '불국사 소개' });
    expect(fetchMock.mock.calls.at(-1)![0]).toContain('offset=20');
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('refreshes filtered pagination after publishing so the next unseen draft is not skipped', async () => {
    let rows = Array.from({ length: 25 }, (_, index) => ({ ...short, id: `short-${index}`, title: `소개 영상 ${index}` }));
    const fetchMock = vi.fn(async (input: string, options?: RequestInit) => {
      if (options?.method === 'PATCH') {
        const body = JSON.parse(String(options.body));
        const saved = { ...rows.find(row => row.id === body.shortId)!, isPublished: body.isPublished };
        rows = rows.map(row => row.id === saved.id ? saved : row);
        return response(saved);
      }
      const query = new URL(input, 'https://app.example').searchParams;
      const offset = Number(query.get('offset'));
      const visible = query.get('status') === 'draft' ? rows.filter(row => !row.isPublished) : rows;
      return response(visible.slice(offset, offset + 20), { nextOffset: offset + 20 < visible.length ? offset + 20 : null });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ShortsEditor places={[place]} />);
    await waitFor(() => expect(screen.getByLabelText('공개 상태')).toBeEnabled());
    fireEvent.change(screen.getByLabelText('공개 상태'), { target: { value: 'draft' } });
    await waitFor(() => expect(screen.getByLabelText('공개 상태')).toBeEnabled());
    const first = screen.getByRole('heading', { name: '소개 영상 0' }).closest('article')!;
    fireEvent.click(within(first).getByRole('button', { name: '공개' }));
    await screen.findByRole('heading', { name: '소개 영상 20' });
    expect(screen.queryByRole('heading', { name: '소개 영상 0' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.at(-1)![0]).toContain('offset=0&status=draft');
    expect(screen.getByText('영상이 공개되었습니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    await screen.findByRole('heading', { name: '소개 영상 24' });
    for (let index = 1; index < 25; index += 1) expect(screen.getByRole('heading', { name: `소개 영상 ${index}` })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(24);
  });

  it('discards the stale page cursor after an edit even when the refreshed list fails', async () => {
    const { fetchMock } = await start([short], { nextOffset: 20 });
    fireEvent.click(screen.getByRole('button', { name: '편집' }));
    fireEvent.change(screen.getByLabelText('영상 제목'), { target: { value: '정렬이 바뀐 영상' } });
    const saved = { ...short, title: '정렬이 바뀐 영상', updatedAt: '2026-09-07T00:00:00Z' };
    fetchMock.mockResolvedValueOnce(response(saved)).mockRejectedValueOnce(new Error('목록 갱신 실패'));
    fireEvent.click(screen.getByRole('button', { name: '변경 저장' }));
    await screen.findByText('목록 갱신 실패');
    expect(screen.getByText('영상이 저장되었습니다.')).toBeInTheDocument();
    expect(screen.getByLabelText('영상 제목')).toHaveValue(saved.title);
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.at(-1)![0]).toContain('offset=0');
    fetchMock.mockResolvedValueOnce(response([saved], { nextOffset: 20 }));
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    await screen.findByRole('button', { name: '더 보기' });
    expect(fetchMock.mock.calls.at(-1)![0]).toContain('offset=0');
  });
});

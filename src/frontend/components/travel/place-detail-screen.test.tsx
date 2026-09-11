// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaceDetailScreen } from './place-detail-screen';
import { messages } from '@/shared/i18n';

vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));
vi.mock('@/frontend/i18n/locale-context', () => ({ useLocale: () => ({ locale: 'ko', messages: messages.ko }) }));
vi.mock('./place-reviews', () => ({ PlaceReviews: () => null }));
vi.mock('./heritage-information', () => ({ HeritageInformation: () => null }));

const place = {
  contentId: '126166', category: 'heritage', name: '경주 불국사', description: '신라 불교 문화의 정수', address: '경주시',
  imageUrl: '', coordinates: [35.79, 129.33], tags: [], source: 'database', overview: '', images: []
};
const narration = {
  id: 'n1', contentId: '126166', lang: 'ko', title: '경주 불국사', summary: '', narration: '불국사에 대해 안내해 드릴게요.',
  tags: [], isAiGenerated: false, promptVersion: 'fallback'
};

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).startsWith('/api/places/')) return { ok: true, json: async () => ({ data: place }) };
    if (String(url).startsWith('/api/ai/narrations/')) return { ok: true, json: async () => ({ data: narration }) };
    return { ok: true, json: async () => ({}) };
  }));
}

/** An Audio whose play() fails the way the 503 TTS response does. */
function stubFailingAudio() {
  const created: string[] = [];
  vi.stubGlobal('Audio', vi.fn(function FakeAudio(this: Record<string, unknown>, src: string) {
    created.push(src);
    this.pause = vi.fn();
    this.play = () => Promise.reject(new Error('NotSupportedError'));
  }));
  return created;
}

function stubSpeech() {
  const spoken: Array<{ text: string; lang: string }> = [];
  const synth = {
    cancel: vi.fn(),
    speak: vi.fn((utterance: { text: string; lang: string }) => spoken.push({ text: utterance.text, lang: utterance.lang }))
  };
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', vi.fn(function FakeUtterance(this: Record<string, unknown>, text: string) {
    this.text = text;
  }));
  return { synth, spoken };
}

describe('place narration playback', () => {
  beforeEach(() => stubFetch());
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('reads the narration with the device voice when the server has no audio', async () => {
    const audios = stubFailingAudio();
    const { spoken } = stubSpeech();
    render(<PlaceDetailScreen contentId="126166" />);

    fireEvent.click(await screen.findByRole('button', { name: /AI 해설/ }));
    const listen = await screen.findByRole('button', { name: messages.ko.ai.listen });
    await act(async () => { fireEvent.click(listen); });

    expect(audios).toHaveLength(1);
    expect(spoken).toEqual([{ text: '불국사에 대해 안내해 드릴게요.', lang: 'ko-KR' }]);
    expect(screen.getByRole('button', { name: messages.ko.ai.pause })).toBeInTheDocument();
  });

  it('goes straight to the device voice after the first failure', async () => {
    const audios = stubFailingAudio();
    const { synth, spoken } = stubSpeech();
    render(<PlaceDetailScreen contentId="126166" />);

    fireEvent.click(await screen.findByRole('button', { name: /AI 해설/ }));
    const listen = await screen.findByRole('button', { name: messages.ko.ai.listen });
    await act(async () => { fireEvent.click(listen); });
    fireEvent.click(screen.getByRole('button', { name: messages.ko.ai.pause }));
    expect(synth.cancel).toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: messages.ko.ai.listen })); });

    expect(audios).toHaveLength(1); // no second doomed audio request
    expect(spoken).toHaveLength(2);
  });

  it('does not show the internal data source next to the category', async () => {
    stubFailingAudio();
    stubSpeech();
    render(<PlaceDetailScreen contentId="126166" />);
    await screen.findByRole('heading', { name: '경주 불국사' });
    expect(screen.queryByText(/database|tour-api|sample/)).not.toBeInTheDocument();
  });
});

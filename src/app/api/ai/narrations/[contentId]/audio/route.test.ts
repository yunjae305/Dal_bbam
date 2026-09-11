import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ context: vi.fn(), rate: vi.fn(), narration: vi.fn(), speech: vi.fn(), available: vi.fn() }));
vi.mock('@/backend/http', async importOriginal => ({
  ...await importOriginal<typeof import('@/backend/http')>(), getUserDataContext: mocks.context, checkRateLimit: mocks.rate
}));
vi.mock('@/backend/narration', () => ({ getOrCreateNarration: mocks.narration }));
vi.mock('@/backend/openai', async importOriginal => ({
  ...await importOriginal<typeof import('@/backend/openai')>(), createSpeech: mocks.speech, isOpenAiAvailable: mocks.available
}));
import { GET } from '@/app/api/ai/narrations/[contentId]/audio/route';

const request = (lang = 'en') => new NextRequest(`https://dal-bbam.example/api/ai/narrations/123/audio?lang=${lang}`);
const params = { params: Promise.resolve({ contentId: '123' }) };

describe('multilingual narration audio', () => {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.available.mockReturnValue(true);
    mocks.rate.mockResolvedValue('ok');
    mocks.narration.mockResolvedValue({ rowId: 'row-1', narration: { narration: 'Source text', isAiGenerated: true } });
    query.maybeSingle.mockResolvedValue({ data: null });
    mocks.context.mockResolvedValue({
      user: { actorKey: 'visitor' },
      db: {
        from: () => query,
        storage: { from: () => ({
          getPublicUrl: () => ({ data: { publicUrl: 'https://cdn.example/123/en/audio.mp3' } }),
          upload: vi.fn().mockResolvedValue({ error: { message: 'mock storage unavailable' } })
        }) }
      }
    });
    mocks.speech.mockResolvedValue(new ArrayBuffer(4));
  });

  it('serves prepared audio without a live AI key or paid-call quota', async () => {
    mocks.available.mockReturnValue(false);
    query.maybeSingle.mockResolvedValue({ data: { audio_path: '123/en/audio.mp3' } });
    const response = await GET(request(), params);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://cdn.example/123/en/audio.mp3');
    expect(mocks.speech).not.toHaveBeenCalled();
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.narration).toHaveBeenCalledWith('123', 'en', 'visitor', { allowGeneration: false });
  });

  it('returns unavailable only when uncached audio cannot be generated', async () => {
    mocks.available.mockReturnValue(false);
    const response = await GET(request(), params);
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('TTS_UNAVAILABLE');
    expect(mocks.speech).not.toHaveBeenCalled();
  });

  it.each(['ko', 'en', 'ja', 'zh'])('labels %s audio and honors the language voice configuration', async lang => {
    const key = `OPENAI_TTS_VOICE_${lang.toUpperCase()}`;
    vi.stubEnv(key, 'nova');
    try {
      const response = await GET(request(lang), params);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-language')).toBe(lang);
      expect(response.headers.get('content-type')).toBe('audio/mpeg');
      expect(mocks.speech).toHaveBeenCalledWith('Source text', 'nova');
    } finally { vi.unstubAllEnvs(); }
  });

  it('stops uncached paid generation when the quota is exhausted', async () => {
    mocks.rate.mockResolvedValue('limited');
    const response = await GET(request(), params);
    expect(response.status).toBe(429);
    expect(mocks.speech).not.toHaveBeenCalled();
  });
});

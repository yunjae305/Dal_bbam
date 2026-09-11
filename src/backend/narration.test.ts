import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { Lang } from '@/shared/types';

const mocks = vi.hoisted(() => ({ db: vi.fn(), generate: vi.fn(), available: vi.fn(), sample: vi.fn(), tour: vi.fn() }));
vi.mock('@/backend/supabase/admin', () => ({ createSupabaseAdminClient: mocks.db }));
vi.mock('@/backend/tour-mvp-data', () => ({ getTourMvpData: mocks.sample }));
vi.mock('@/backend/tour-api', () => ({ getTourPlaceDetail: mocks.tour }));
vi.mock('@/backend/openai', async importOriginal => ({
  ...await importOriginal<typeof import('@/backend/openai')>(),
  generateStructured: mocks.generate,
  isOpenAiAvailable: mocks.available
}));
import { getOrCreateNarration } from '@/backend/narration';

function database(cached: Record<string, unknown> | null = null) {
  const narrationQuery = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: cached }),
    upsert: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'saved' } })
  };
  const placesQuery = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: {
      id: 'place-1', content_id: '123', name: '첨성대', overview: ' 신라의 천문 관측대입니다. ',
      place_translations: [{ lang: 'en', name: 'Cheomseongdae', overview: ' An astronomical observatory. ' }]
    } })
  };
  mocks.db.mockReturnValue({ from: (table: string) => table === 'places' ? placesQuery : narrationQuery });
  return narrationQuery;
}

describe('grounded multilingual narration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.available.mockReturnValue(true);
    mocks.sample.mockResolvedValue({ places: [] });
    database();
    mocks.generate.mockImplementation(async ({ input }: { input: string }) => {
      const source = JSON.parse(input);
      return { model: 'mock-model', value: {
        contentId: source.contentId, lang: source.lang, title: source.placeName,
        summary: 'Short summary', narration: source.tourismOrganizationOverview, tags: ['history']
      } };
    });
  });

  it.each<[Lang, string]>([['ko', 'Korean'], ['en', 'English'], ['ja', 'Japanese'], ['zh', 'Simplified Chinese']])(
    'requests grounded narration in %s', async (lang, name) => {
      const result = await getOrCreateNarration('123', lang, 'visitor');
      expect(result.narration.lang).toBe(lang);
      expect(result.fallback).toBe(false);
      expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
        instructions: expect.stringContaining(`Write only in ${name}`)
      }));
      expect(mocks.generate.mock.calls[0][0].instructions).toContain('Do not add dates');
    }
  );

  it('reuses prepared translations with exactly the same normalized source hash', async () => {
    const query = database({ id: 'cached', title: 'Cheomseongdae', summary: 'Summary', narration: 'Cached text', tags: ['history'], is_ai_generated: true, audio_path: '123/en/cached.mp3' });
    const result = await getOrCreateNarration('123', 'en', 'visitor');
    expect(query.eq).toHaveBeenCalledWith('source_hash', createHash('sha256').update('An astronomical observatory.').digest('hex'));
    expect(result.rowId).toBe('cached');
    expect(result.narration.audioUrl).toContain('lang=en');
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('coalesces simultaneous requests for the same place and language', async () => {
    const results = await Promise.all([
      getOrCreateNarration('123', 'en', 'first'),
      getOrCreateNarration('123', 'en', 'second'),
      getOrCreateNarration('123', 'en', 'third')
    ]);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(results.every(result => result.rowId === 'saved')).toBe(true);
  });

  it('rejects malformed model output and labels the grounded fallback honestly', async () => {
    mocks.generate.mockResolvedValue({ model: 'mock', value: { contentId: '123', lang: 'en', title: 'Bad' } });
    const result = await getOrCreateNarration('123', 'en', 'visitor');
    expect(result.fallback).toBe(true);
    expect(result.narration.isAiGenerated).toBe(false);
    expect(result.narration.narration).toContain('An astronomical observatory.');
  });

  it('supports a cache-only lookup without any paid generation', async () => {
    const result = await getOrCreateNarration('123', 'en', 'visitor', { allowGeneration: false });
    expect(result.fallback).toBe(true);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});

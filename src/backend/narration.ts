import { getTourMvpData } from '@/backend/tour-mvp-data';
import { getTourPlaceDetail } from '@/backend/tour-api';
import { createSupabaseAdminClient } from '@/backend/supabase/admin';
import {
  contentHash,
  generateStructured,
  isOpenAiAvailable,
  narrationCacheKey
} from '@/backend/openai';
import { stripProviderHtml } from '@/backend/place-mapper';
import type { Lang, Narration } from '@/shared/types';

export const NARRATION_PROMPT_VERSION = 'narration-v1';
// After an OpenAI 401 every request would otherwise re-hit the provider just to
// fall back again; remember the rejection for a while (module scope, per instance).
const OPENAI_UNAUTHORIZED_BACKOFF_MS = 5 * 60 * 1000;
let openAiUnauthorizedUntil = 0;

function openAiAvailable(): boolean {
  if (!isOpenAiAvailable()) return false;
  return openAiUnauthorizedUntil <= Date.now();
}

function errorStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status?: unknown }).status);
    return Number.isFinite(status) ? status : undefined;
  }
  return undefined;
}

const languageNames: Record<Lang, string> = {
  ko: 'Korean',
  en: 'English',
  ja: 'Japanese',
  zh: 'Simplified Chinese'
};

type Grounding = {
  placeId?: string;
  contentId: string;
  name: string;
  overview: string;
};

type AiNarration = {
  contentId: string;
  lang: Lang;
  title: string;
  summary: string;
  narration: string;
  tags: string[];
};

const narrationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['contentId', 'lang', 'title', 'summary', 'narration', 'tags'],
  properties: {
    contentId: { type: 'string' },
    lang: { type: 'string', enum: ['ko', 'en', 'ja', 'zh'] },
    title: { type: 'string', minLength: 1, maxLength: 80 },
    summary: { type: 'string', minLength: 1, maxLength: 240 },
    narration: { type: 'string', minLength: 1, maxLength: 1800 },
    tags: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: { type: 'string', minLength: 1, maxLength: 30 }
    }
  }
};

function providerField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return value === null || value === undefined ? '' : String(value);
}

async function getGrounding(contentId: string, lang: Lang): Promise<Grounding | null> {
  const db = createSupabaseAdminClient();
  let placeId: string | undefined;
  let name = '';
  let overview = '';

  if (db) {
    const { data } = await db
      .from('places')
      .select('id, content_id, name, overview, description, place_translations(lang, name, overview, description)')
      .eq('content_id', contentId)
      .maybeSingle();
    if (data) {
      placeId = String(data.id);
      // Ground non-Korean narration in the translated source text when it exists.
      const translations = (data.place_translations ?? []) as Array<{
        lang: string;
        name: string | null;
        overview: string | null;
        description: string | null;
      }>;
      const translation = translations.find(item => item.lang === lang);
      name = String(translation?.name || data.name || '');
      overview = String(
        translation?.overview || translation?.description || data.overview || data.description || ''
      );
    }
  }

  // Rows synced without an overview still need grounding text, so fall through to TourAPI.
  if (!overview.trim() && /^\d+$/.test(contentId)) {
    try {
      const detail = await getTourPlaceDetail(contentId);
      const row = detail.items[0] as Record<string, unknown> | undefined;
      if (row) {
        name = name || providerField(row, 'title');
        overview = stripProviderHtml(providerField(row, 'overview'));
      }
    } catch {
      // Sample fallback below.
    }
  }

  if (overview.trim()) {
    return { placeId, contentId, name: name || '경주 관광지', overview };
  }

  const place = (await getTourMvpData(lang)).places.find(item =>
    item.contentId === contentId || item.id === contentId
  );
  return place ? {
    contentId: place.contentId,
    name: place.name,
    overview: place.description
  } : null;
}

function fallbackNarration(grounding: Grounding, lang: Lang): Narration {
  const template: Record<Lang, (name: string, overview: string) => string> = {
    ko: (name, overview) => `${name}에 대해 안내해 드릴게요. ${overview}`,
    en: (name, overview) => `Here is a quick introduction to ${name}. ${overview}`,
    ja: (name, overview) => `${name}についてご案内します。${overview}`,
    zh: (name, overview) => `为您介绍${name}。${overview}`
  };
  const summary = grounding.overview.slice(0, 220);
  return {
    id: narrationCacheKey(grounding.contentId, lang, grounding.overview, NARRATION_PROMPT_VERSION),
    contentId: grounding.contentId,
    lang,
    title: grounding.name,
    summary,
    narration: template[lang](grounding.name, grounding.overview),
    tags: [],
    isAiGenerated: false,
    promptVersion: NARRATION_PROMPT_VERSION
  };
}

function validateNarration(value: AiNarration, grounding: Grounding, lang: Lang): boolean {
  return value.contentId === grounding.contentId &&
    value.lang === lang &&
    value.title.length > 0 &&
    value.title.length <= 80 &&
    value.summary.length > 0 &&
    value.summary.length <= 240 &&
    value.narration.length > 0 &&
    value.narration.length <= 1800 &&
    value.tags.length <= 6;
}

export async function getOrCreateNarration(
  contentId: string,
  lang: Lang,
  actorKey: string
): Promise<{ narration: Narration; rowId?: string; fallback: boolean }> {
  const grounding = await getGrounding(contentId, lang);
  if (!grounding || !grounding.overview.trim()) {
    throw new Error('PLACE_GROUNDING_NOT_FOUND');
  }

  const sourceHash = contentHash(grounding.overview);
  const cacheKey = narrationCacheKey(contentId, lang, grounding.overview, NARRATION_PROMPT_VERSION);
  const db = createSupabaseAdminClient();
  if (db && grounding.placeId) {
    const { data } = await db
      .from('ai_narrations')
      .select('id, title, summary, narration, tags, audio_path, is_ai_generated')
      .eq('place_id', grounding.placeId)
      .eq('lang', lang)
      .eq('source_hash', sourceHash)
      .eq('prompt_version', NARRATION_PROMPT_VERSION)
      .maybeSingle();
    if (data) {
      return {
        narration: {
          id: String(data.id),
          contentId,
          lang,
          title: String(data.title),
          summary: String(data.summary),
          narration: String(data.narration),
          tags: (data.tags as string[] | null) ?? [],
          audioUrl: data.audio_path ? `/api/ai/narrations/${encodeURIComponent(contentId)}/audio?lang=${lang}` : undefined,
          isAiGenerated: Boolean(data.is_ai_generated),
          promptVersion: NARRATION_PROMPT_VERSION
        },
        rowId: String(data.id),
        fallback: !data.is_ai_generated
      };
    }
  }

  if (!openAiAvailable()) {
    console.info(JSON.stringify({
      event: 'openai_fallback',
      operation: 'tour_narration',
      reason: process.env.OPENAI_API_KEY?.trim() ? 'unauthorized_backoff' : 'not_configured',
      contentId,
      lang
    }));
    return { narration: fallbackNarration(grounding, lang), fallback: true };
  }

  try {
    const result = await generateStructured<AiNarration>({
      name: 'tour_narration',
      schema: narrationSchema,
      actorKey,
      instructions: [
        `Write only in ${languageNames[lang]}.`,
        'Use only facts explicitly present in the supplied Tourism Organization overview.',
        'Do not add dates, legends, opening hours, people, or historical claims not present in the overview.',
        'Produce a concise mobile narration suitable for roughly one minute of speech.'
      ].join(' '),
      input: JSON.stringify({
        contentId: grounding.contentId,
        lang,
        placeName: grounding.name,
        tourismOrganizationOverview: grounding.overview
      })
    });
    if (!validateNarration(result.value, grounding, lang)) {
      throw new Error('OpenAI narration output failed server validation.');
    }

    const narration: Narration = {
      id: cacheKey,
      ...result.value,
      isAiGenerated: true,
      promptVersion: NARRATION_PROMPT_VERSION
    };
    if (db && grounding.placeId) {
      const { data } = await db
        .from('ai_narrations')
        .upsert({
          place_id: grounding.placeId,
          lang,
          title: narration.title,
          summary: narration.summary,
          narration: narration.narration,
          tags: narration.tags,
          source_hash: sourceHash,
          prompt_version: NARRATION_PROMPT_VERSION,
          model: result.model,
          is_ai_generated: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'place_id,lang,source_hash,prompt_version' })
        .select('id')
        .single();
      if (data?.id) {
        narration.id = String(data.id);
        return { narration, rowId: String(data.id), fallback: false };
      }
    }
    return { narration, fallback: false };
  } catch (error) {
    const status = errorStatus(error);
    if (status === 401) {
      openAiUnauthorizedUntil = Date.now() + OPENAI_UNAUTHORIZED_BACKOFF_MS;
    }
    console.info(JSON.stringify({
      event: 'openai_fallback',
      operation: 'tour_narration',
      ...(status ? { status } : {}),
      contentId,
      lang
    }));
    return { narration: fallbackNarration(grounding, lang), fallback: true };
  }
}

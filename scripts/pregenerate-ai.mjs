import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'OPENAI_API_KEY'];
for (const name of required) {
  if (!process.env[name]?.trim()) throw new Error(`${name} is required.`);
}

const model = process.env.OPENAI_TEXT_MODEL || 'gpt-5.6-terra';
const ttsModel = process.env.OPENAI_TTS_MODEL || 'tts-1';
const promptVersion = 'narration-v1';
const languages = ['ko', 'en', 'ja', 'zh'];
const languageNames = {
  ko: 'Korean',
  en: 'English',
  ja: 'Japanese',
  zh: 'Simplified Chinese'
};
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30_000,
  maxRetries: 1
});
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['contentId', 'lang', 'title', 'summary', 'narration', 'tags'],
  properties: {
    contentId: { type: 'string' },
    lang: { type: 'string', enum: languages },
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

const PLACE_LIMIT = 50;
const placeColumns = 'id, content_id, name, overview, description, image_url';

// Stamp targets are the places users are guaranteed to open, so their
// narrations must exist before the generic catalogue is filled in.
const places = [];
const seenPlaceIds = new Set();
function addPlaces(rows) {
  for (const row of rows ?? []) {
    if (!row?.id || !row.content_id || seenPlaceIds.has(row.id) || places.length >= PLACE_LIMIT) continue;
    seenPlaceIds.add(row.id);
    places.push(row);
  }
}

const { data: stampTargets, error: stampTargetsError } = await supabase
  .from('stamp_targets')
  .select(`place_id, sort_order, places(${placeColumns})`)
  .eq('is_active', true)
  .order('sort_order', { ascending: true });
if (stampTargetsError) throw stampTargetsError;
addPlaces((stampTargets ?? []).map(target => Array.isArray(target.places) ? target.places[0] : target.places));

const configuredStampContentIds = [...new Set(
  (process.env.STAMP_TARGET_CONTENT_IDS ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
)];
if (configuredStampContentIds.length) {
  const { data: configured, error: configuredError } = await supabase
    .from('places')
    .select(placeColumns)
    .in('content_id', configuredStampContentIds);
  if (configuredError) throw configuredError;
  addPlaces(
    configuredStampContentIds.flatMap(contentId =>
      (configured ?? []).filter(row => String(row.content_id) === contentId))
  );
}

if (places.length < PLACE_LIMIT) {
  const { data: catalogue, error: placesError } = await supabase
    .from('places')
    .select(placeColumns)
    .not('content_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(PLACE_LIMIT + places.length);
  if (placesError) throw placesError;
  addPlaces(catalogue);
}

let generated = 0;
let skipped = 0;
for (const place of places) {
  const overview = String(place.overview || place.description || '').trim();
  if (!overview) continue;
  const sourceHash = createHash('sha256').update(overview).digest('hex');

  for (const lang of languages) {
    const { data: cached, error: cachedError } = await supabase
      .from('ai_narrations')
      .select('id, title, summary, narration, tags, audio_path')
      .eq('place_id', place.id)
      .eq('lang', lang)
      .eq('source_hash', sourceHash)
      .eq('prompt_version', promptVersion)
      .maybeSingle();
    if (cachedError) throw cachedError;

    let narration = cached;
    let content;
    if (!narration) {
      const response = await openai.responses.create({
        model,
        store: false,
        safety_identifier: createHash('sha256').update('dal-bbam-pregeneration').digest('hex'),
        reasoning: { effort: 'low' },
        instructions: `Write only in ${languageNames[lang]}. Use only facts in the supplied Tourism Organization overview. Create a roughly one-minute mobile narration.`,
        input: JSON.stringify({
          contentId: String(place.content_id),
          lang,
          placeName: String(place.name),
          tourismOrganizationOverview: overview
        }),
        text: {
          format: {
            type: 'json_schema',
            name: 'tour_narration',
            strict: true,
            schema
          }
        }
      });
      content = JSON.parse(response.output_text);
      if (content.contentId !== String(place.content_id) || content.lang !== lang) {
        throw new Error(`Server validation failed for ${place.content_id}:${lang}`);
      }

      const { data, error } = await supabase.from('ai_narrations').upsert({
        place_id: place.id,
        lang,
        title: content.title,
        summary: content.summary,
        narration: content.narration,
        tags: content.tags,
        source_hash: sourceHash,
        prompt_version: promptVersion,
        model,
        is_ai_generated: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'place_id,lang,source_hash,prompt_version' }).select('id, title, summary, narration, tags, audio_path').single();
      if (error) throw error;
      narration = data;
    } else {
      content = {
        title: narration.title,
        summary: narration.summary,
        narration: narration.narration,
        tags: narration.tags
      };
    }

    let audioPath = narration.audio_path;
    if (!audioPath) {
      const speech = await openai.audio.speech.create({
        model: ttsModel,
        voice: 'alloy',
        input: String(content.narration).slice(0, 4096),
        response_format: 'mp3'
      });
      const audio = await speech.arrayBuffer();
      audioPath = `${place.content_id}/${lang}/${narration.id}.mp3`;
      const { error: uploadError } = await supabase.storage
        .from('narration-audio')
        .upload(audioPath, audio, { contentType: 'audio/mpeg', upsert: true });
      if (uploadError) throw uploadError;
      const { error: audioUpdateError } = await supabase
        .from('ai_narrations')
        .update({ audio_path: audioPath })
        .eq('id', narration.id);
      if (audioUpdateError) throw audioUpdateError;
    } else {
      skipped += 1;
    }
    const { data: audioUrl } = supabase.storage.from('narration-audio').getPublicUrl(audioPath);

    const { data: existingShort, error: existingShortError } = await supabase
      .from('shorts')
      .select('id')
      .eq('place_id', place.id)
      .eq('lang', lang)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existingShortError) throw existingShortError;
    const generatedContent = {
      narration_id: narration.id,
      title: content.title,
      summary: content.summary,
      narration: content.narration,
      audio_url: audioUrl.publicUrl,
      tags: content.tags,
      updated_at: new Date().toISOString()
    };
    const { error: shortError } = existingShort
      ? await supabase.from('shorts').update(generatedContent).eq('id', existingShort.id)
      : await supabase.from('shorts').insert({
          ...generatedContent,
          place_id: place.id,
          lang,
          image_url: place.image_url,
          duration_seconds: 60,
          is_published: true
        });
    if (shortError) throw shortError;
    generated += 1;
    process.stdout.write(`Synced ${place.content_id}:${lang}\n`);
  }
}

process.stdout.write(`Done. Synced ${generated} shorts, reused ${skipped} cached audio files.\n`);

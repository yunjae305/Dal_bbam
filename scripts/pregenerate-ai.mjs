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

const { data: places, error: placesError } = await supabase
  .from('places')
  .select('id, content_id, name, overview, description, image_url')
  .not('content_id', 'is', null)
  .order('created_at', { ascending: true })
  .limit(50);
if (placesError) throw placesError;

let generated = 0;
let skipped = 0;
for (const place of places ?? []) {
  const overview = String(place.overview || place.description || '').trim();
  if (!overview) continue;
  const sourceHash = createHash('sha256').update(overview).digest('hex');

  for (const lang of languages) {
    const { data: cached } = await supabase
      .from('ai_narrations')
      .select('id, audio_path')
      .eq('place_id', place.id)
      .eq('lang', lang)
      .eq('source_hash', sourceHash)
      .eq('prompt_version', promptVersion)
      .maybeSingle();
    if (cached?.audio_path) {
      skipped += 1;
      continue;
    }

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
      }, { onConflict: 'place_id,lang,source_hash,prompt_version' }).select('id, audio_path').single();
      if (error) throw error;
      narration = data;
    } else {
      const { data, error } = await supabase
        .from('ai_narrations')
        .select('title, summary, narration, tags')
        .eq('id', narration.id)
        .single();
      if (error) throw error;
      content = data;
    }

    const speech = await openai.audio.speech.create({
      model: ttsModel,
      voice: 'alloy',
      input: String(content.narration).slice(0, 4096),
      response_format: 'mp3'
    });
    const audio = await speech.arrayBuffer();
    const audioPath = `${place.content_id}/${lang}/${narration.id}.mp3`;
    const { error: uploadError } = await supabase.storage
      .from('narration-audio')
      .upload(audioPath, audio, { contentType: 'audio/mpeg', upsert: true });
    if (uploadError) throw uploadError;
    await supabase.from('ai_narrations').update({ audio_path: audioPath }).eq('id', narration.id);
    const { data: audioUrl } = supabase.storage.from('narration-audio').getPublicUrl(audioPath);

    const { data: existingShort } = await supabase
      .from('shorts')
      .select('id')
      .eq('place_id', place.id)
      .eq('lang', lang)
      .maybeSingle();
    if (!existingShort) {
      const { error: shortError } = await supabase.from('shorts').insert({
        place_id: place.id,
        narration_id: narration.id,
        lang,
        title: content.title,
        summary: content.summary,
        narration: content.narration,
        image_url: place.image_url,
        audio_url: audioUrl.publicUrl,
        duration_seconds: 60,
        tags: content.tags,
        is_published: true
      });
      if (shortError) throw shortError;
    }
    generated += 1;
    process.stdout.write(`Generated ${place.content_id}:${lang}\n`);
  }
}

process.stdout.write(`Done. Generated ${generated}, skipped ${skipped} cached narrations.\n`);

import { createHash } from 'node:crypto';
import OpenAI from 'openai';

const DEFAULT_TEXT_MODEL = 'gpt-5.6-terra';
const DEFAULT_TTS_MODEL = 'tts-1';
const DEFAULT_MODERATION_MODEL = 'omni-moderation-latest';
const DEFAULT_IMAGE_MODEL = 'gpt-image-2';
const DEFAULT_TIMEOUT_MS = 4500;
const MAX_STAMP_IMAGE_BYTES = 10 * 1024 * 1024;

type JsonSchema = Record<string, unknown>;

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

let cachedClient: OpenAI | null = null;

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY is not configured.');
  return key;
}

function timeoutMs(): number {
  const parsed = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(parsed) ? Math.min(15000, Math.max(1000, parsed)) : DEFAULT_TIMEOUT_MS;
}

function openai(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: apiKey(),
      timeout: timeoutMs(),
      maxRetries: 0
    });
  }
  return cachedClient;
}

export function safetyIdentifier(actorKey: string): string {
  return createHash('sha256').update(actorKey).digest('hex');
}

export function contentHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function narrationCacheKey(
  contentId: string,
  lang: string,
  source: string,
  promptVersion: string
): string {
  return `${contentId}:${lang}:${contentHash(source)}:${promptVersion}`;
}

export async function generateStructured<T>({
  name,
  schema,
  instructions,
  input,
  actorKey
}: {
  name: string;
  schema: JsonSchema;
  instructions: string;
  input: unknown;
  actorKey: string;
}): Promise<{ value: T; usage?: Usage; model: string }> {
  const model = process.env.OPENAI_TEXT_MODEL?.trim() || DEFAULT_TEXT_MODEL;
  const startedAt = Date.now();
  const response = await openai().responses.create({
    model,
    store: false,
    safety_identifier: safetyIdentifier(actorKey),
    reasoning: { effort: 'low' },
    instructions,
    input: input as never,
    text: {
      format: {
        type: 'json_schema',
        name,
        strict: true,
        schema
      }
    }
  });

  const raw = response.output_text.trim();
  if (!raw) throw new Error('OpenAI returned no structured output.');
  const value = JSON.parse(raw) as T;

  console.info(JSON.stringify({
    event: 'openai_response',
    operation: name,
    model,
    durationMs: Date.now() - startedAt,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
    totalTokens: response.usage?.total_tokens ?? null
  }));

  return { value, usage: response.usage ?? undefined, model };
}

export async function createSpeech(input: string, voice = 'alloy'): Promise<ArrayBuffer> {
  const model = process.env.OPENAI_TTS_MODEL?.trim() || DEFAULT_TTS_MODEL;
  const response = await openai().audio.speech.create({
    model,
    voice,
    input: input.slice(0, 4096),
    response_format: 'mp3'
  }, {
    timeout: Math.max(10000, timeoutMs())
  });

  return response.arrayBuffer();
}

export function decodeGeneratedPng(imageBase64: string): Buffer {
  const normalized = imageBase64.replace(/\s+/g, '');
  if (!normalized || normalized.length > Math.ceil(MAX_STAMP_IMAGE_BYTES * 4 / 3) + 8) {
    throw new Error('OpenAI returned an invalid stamp artwork payload.');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error('OpenAI returned malformed base64 image data.');
  }

  const bytes = Buffer.from(normalized, 'base64');
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < pngSignature.length || bytes.length > MAX_STAMP_IMAGE_BYTES || !bytes.subarray(0, 8).equals(pngSignature)) {
    throw new Error('OpenAI returned an invalid PNG stamp artwork.');
  }
  return bytes;
}

export async function generateStampArtwork(prompt: string): Promise<{
  bytes: Buffer;
  mimeType: 'image/png';
  model: string;
}> {
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
  const startedAt = Date.now();
  const response = await openai().images.generate({
    model,
    prompt,
    n: 1,
    size: '1024x1024',
    quality: 'medium',
    background: 'opaque',
    output_format: 'png',
    moderation: 'auto',
    user: safetyIdentifier('admin:stamp-artwork')
  }, {
    timeout: 120_000,
    maxRetries: 1
  });
  const imageBase64 = response.data?.[0]?.b64_json;
  if (!imageBase64) throw new Error('OpenAI returned no stamp artwork.');

  const bytes = decodeGeneratedPng(imageBase64);
  console.info(JSON.stringify({
    event: 'openai_image_response',
    operation: 'stamp_artwork',
    model,
    durationMs: Date.now() - startedAt,
    outputBytes: bytes.length
  }));
  return { bytes, mimeType: 'image/png', model };
}

export type ModerationResult = {
  allowed: boolean;
  flagged: boolean;
  categories: Record<string, boolean>;
  provider: 'openai' | 'local';
};

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const phonePattern = /(?:\+?82[-.\s]?)?(?:0?1[016789]|0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}/;
// Minimal keyword screen used when OpenAI moderation is switched off (FEATURE_AI=false or no key).
const localBlockedPatterns: Array<[string, RegExp]> = [
  ['harassment', /(?:씨발|시발|병신|개새끼|좆|fuck(?:ing)?|bitch|asshole)/i],
  ['sexual', /(?:야동|섹스|porn|sex\s*video|nude)/i],
  ['spam', /(?:카지노|casino|바카라|도박\s*사이트|대출\s*문의|텔레그램\s*@)/i]
];

export function containsPersonalInformation(text: string): boolean {
  return emailPattern.test(text) || phonePattern.test(text);
}

/** True when AI features may call OpenAI: feature flag on and a key configured. */
export function isOpenAiAvailable(): boolean {
  const flag = process.env.FEATURE_AI?.trim().toLowerCase();
  const enabled = flag === undefined || !['0', 'false', 'off'].includes(flag);
  return enabled && Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function moderateContentLocally(text: string): ModerationResult {
  if (containsPersonalInformation(text)) {
    return { allowed: false, flagged: true, categories: { personal_information: true }, provider: 'local' };
  }
  const categories: Record<string, boolean> = {};
  for (const [category, pattern] of localBlockedPatterns) {
    if (pattern.test(text)) categories[category] = true;
  }
  const flagged = Object.keys(categories).length > 0;
  return { allowed: !flagged, flagged, categories, provider: 'local' };
}

export async function moderateContent({
  text,
  imageUrl
}: {
  text: string;
  imageUrl?: string;
}): Promise<ModerationResult> {
  if (containsPersonalInformation(text)) {
    return { allowed: false, flagged: true, categories: { personal_information: true }, provider: 'local' };
  }
  if (!isOpenAiAvailable()) {
    // Without OpenAI the community still works with the keyword screen above;
    // images cannot be inspected, so they pass with only the size/type checks.
    return moderateContentLocally(text);
  }

  const input: unknown[] = [{ type: 'text', text: text.slice(0, 10000) }];
  if (imageUrl) input.push({ type: 'image_url', image_url: { url: imageUrl } });

  const response = await openai().moderations.create({
    model: process.env.OPENAI_MODERATION_MODEL?.trim() || DEFAULT_MODERATION_MODEL,
    input: input as never
  });

  const result = response.results[0];
  return {
    allowed: !result?.flagged,
    flagged: Boolean(result?.flagged),
    categories: (result?.categories as unknown as Record<string, boolean>) ?? {},
    provider: 'openai'
  };
}

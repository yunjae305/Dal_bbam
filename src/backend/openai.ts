import { createHash } from 'node:crypto';
import OpenAI from 'openai';

const DEFAULT_TEXT_MODEL = 'gpt-5.6-terra';
const DEFAULT_TTS_MODEL = 'tts-1';
const DEFAULT_MODERATION_MODEL = 'omni-moderation-latest';
const DEFAULT_TIMEOUT_MS = 4500;

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

export type ModerationResult = {
  allowed: boolean;
  flagged: boolean;
  categories: Record<string, boolean>;
};

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const phonePattern = /(?:\+?82[-.\s]?)?(?:0?1[016789]|0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}/;

export function containsPersonalInformation(text: string): boolean {
  return emailPattern.test(text) || phonePattern.test(text);
}

export async function moderateContent({
  text,
  imageUrl
}: {
  text: string;
  imageUrl?: string;
}): Promise<ModerationResult> {
  if (containsPersonalInformation(text)) {
    return { allowed: false, flagged: true, categories: { personal_information: true } };
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
    categories: (result?.categories as unknown as Record<string, boolean>) ?? {}
  };
}

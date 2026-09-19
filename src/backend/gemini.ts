/**
 * Gemini text generation. The operator picked Gemini and asked for the cheapest
 * model. 2.5 Flash-Lite is cheaper on paper but Google no longer serves it to new
 * keys (404 "no longer available to new users"), so 3.1 Flash-Lite is the cheapest
 * one this project can actually call. Thinking is switched off to keep tokens down.
 */
const DEFAULT_TEXT_MODEL = 'gemini-3.1-flash-lite';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_TIMEOUT_MS = 8000;

type JsonSchema = Record<string, unknown>;
export type GeminiUsage = { input_tokens?: number; output_tokens?: number; total_tokens?: number };

type GenerateResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  error?: { message?: string; status?: string };
};

export function geminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('GEMINI_API_KEY is not configured.');
  return key;
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function geminiTextModel(): string {
  return process.env.GEMINI_TEXT_MODEL?.trim() || DEFAULT_TEXT_MODEL;
}

function timeoutMs(): number {
  const configured = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS);
  return Number.isFinite(configured) ? Math.min(20_000, Math.max(1_000, configured)) : DEFAULT_TIMEOUT_MS;
}

/**
 * Gemini accepts an OpenAPI subset, not full JSON Schema: keys such as
 * `additionalProperties` and `$schema` make the request fail, so they are dropped
 * while the structure the callers rely on is kept.
 */
export function toGeminiSchema(schema: JsonSchema): JsonSchema {
  const allowed = new Set(['type', 'format', 'description', 'nullable', 'enum', 'items', 'properties', 'required', 'minItems', 'maxItems', 'propertyOrdering']);
  const convert = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(convert);
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (!allowed.has(key)) continue;
      out[key] = key === 'properties'
        ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, child]) => [name, convert(child)]))
        : convert(value);
    }
    return out;
  };
  return convert(schema) as JsonSchema;
}

async function callGemini(body: unknown, operation: string, model: string): Promise<GenerateResponse> {
  const startedAt = Date.now();
  const response = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs()),
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => null) as GenerateResponse | null;
  if (!response.ok || !payload || payload.error) {
    throw new Error(`Gemini request failed (${response.status}): ${payload?.error?.message ?? 'no response body'}`);
  }
  console.info(JSON.stringify({
    event: 'gemini_response',
    operation,
    model,
    durationMs: Date.now() - startedAt,
    inputTokens: payload.usageMetadata?.promptTokenCount ?? null,
    outputTokens: payload.usageMetadata?.candidatesTokenCount ?? null,
    totalTokens: payload.usageMetadata?.totalTokenCount ?? null
  }));
  return payload;
}

function firstText(payload: GenerateResponse): string {
  return (payload.candidates?.[0]?.content?.parts ?? []).map(part => part.text ?? '').join('').trim();
}

function usageOf(payload: GenerateResponse): GeminiUsage {
  return {
    input_tokens: payload.usageMetadata?.promptTokenCount,
    output_tokens: payload.usageMetadata?.candidatesTokenCount,
    total_tokens: payload.usageMetadata?.totalTokenCount
  };
}

const MAX_INLINE_IMAGE_BYTES = 7 * 1024 * 1024;

/** Gemini takes image bytes rather than a URL, so the photo is fetched once and inlined. */
async function inlineImagePart(imageUrl: string): Promise<{ inlineData: { mimeType: string; data: string } }> {
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(timeoutMs()), cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not read the image to inspect (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_INLINE_IMAGE_BYTES) throw new Error('Image is empty or too large to inspect.');
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
  if (!mimeType.startsWith('image/')) throw new Error(`Unsupported media type to inspect: ${mimeType}`);
  return { inlineData: { mimeType, data: bytes.toString('base64') } };
}

export async function generateStructuredWithGemini<T>({
  name,
  schema,
  instructions,
  input,
  imageUrl
}: {
  name: string;
  schema: JsonSchema;
  instructions: string;
  input: unknown;
  imageUrl?: string;
}): Promise<{ value: T; usage?: GeminiUsage; model: string }> {
  const model = geminiTextModel();
  const parts: unknown[] = [{ text: typeof input === 'string' ? input : JSON.stringify(input) }];
  if (imageUrl) parts.push(await inlineImagePart(imageUrl));
  const payload = await callGemini({
    systemInstruction: { parts: [{ text: instructions }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: toGeminiSchema(schema),
      temperature: 0.7,
      // No deliberation tokens: the operator asked for the smallest token footprint.
      thinkingConfig: { thinkingBudget: 0 }
    }
  }, name, model);

  const raw = firstText(payload);
  if (!raw) throw new Error('Gemini returned no structured output.');
  return { value: JSON.parse(raw) as T, usage: usageOf(payload), model };
}

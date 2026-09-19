import { generateStructured as generateStructuredWithOpenAi } from '@/backend/openai';
import { generateStructuredWithGemini, isGeminiConfigured } from '@/backend/gemini';

/**
 * AI entry point for the two features the operator connected: course recommendation
 * and the visitor story draft. Narration, moderation and image inspection keep their
 * existing non-AI paths, so they are re-exported here unchanged.
 */
export { contentHash, moderateContent, moderateContentLocally, containsPersonalInformation, type ModerationResult } from '@/backend/openai';

export function aiProvider(): 'gemini' | 'openai' | 'none' {
  const flag = process.env.FEATURE_AI?.trim().toLowerCase();
  if (flag !== undefined && ['0', 'false', 'off'].includes(flag)) return 'none';
  if (isGeminiConfigured()) return 'gemini';
  if (process.env.OPENAI_API_KEY?.trim()) return 'openai';
  return 'none';
}

/** True when AI features may call a provider: feature flag on and a key configured. */
export function isAiAvailable(): boolean {
  return aiProvider() !== 'none';
}

export async function generateStructured<T>(args: {
  name: string;
  schema: Record<string, unknown>;
  instructions: string;
  input: unknown;
  actorKey: string;
  /** When set, the provider looks at this image alongside the text. */
  imageUrl?: string;
}): Promise<{ value: T; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }; model: string }> {
  if (aiProvider() === 'gemini') return generateStructuredWithGemini<T>(args);
  const { imageUrl, input, ...rest } = args;
  return generateStructuredWithOpenAi<T>({
    ...rest,
    input: imageUrl
      ? [{ role: 'user', content: [{ type: 'input_text', text: typeof input === 'string' ? input : JSON.stringify(input) }, { type: 'input_image', image_url: imageUrl }] }]
      : input
  });
}

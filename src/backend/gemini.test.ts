import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateStructuredWithGemini, toGeminiSchema } from './gemini';

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['title'],
  properties: { title: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }
};

function reply(text: string) {
  return Response.json({
    candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, totalTokenCount: 150 }
  });
}

describe('Gemini provider', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('drops the JSON Schema keywords Gemini rejects', () => {
    expect(toGeminiSchema(schema)).toEqual({
      type: 'object',
      required: ['title'],
      properties: { title: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }
    });
  });

  it('asks the cheapest model for JSON without spending thinking tokens', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    const fetcher = vi.fn().mockResolvedValue(reply('{"title":"불국사"}'));
    vi.stubGlobal('fetch', fetcher);

    const result = await generateStructuredWithGemini<{ title: string }>({
      name: 'tour_narration', schema, instructions: 'Write in Korean.', input: { contentId: '126166' }
    });

    expect(result.value.title).toBe('불국사');
    expect(result.model).toBe('gemini-3.1-flash-lite');
    expect(result.usage).toMatchObject({ input_tokens: 120, output_tokens: 30 });
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain('/models/gemini-3.1-flash-lite:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig).toMatchObject({ responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } });
    expect(body.generationConfig.responseSchema.additionalProperties).toBeUndefined();
  });

  it('reports the provider error instead of returning an empty narration', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { message: 'quota exceeded' } }, { status: 429 })));
    await expect(generateStructuredWithGemini({ name: 'tour_narration', schema, instructions: '', input: {} }))
      .rejects.toThrow(/quota exceeded/);
  });

  it('sends the photo itself, not its URL, when a story draft supplies one', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(Buffer.from([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }))
      .mockResolvedValueOnce(reply('{"title":"첫 여행"}'));
    vi.stubGlobal('fetch', fetcher);

    await generateStructuredWithGemini({
      name: 'community_story_draft', schema, instructions: 'Write in ko.', input: 'notes',
      imageUrl: 'https://storage.example/photo.jpg'
    });

    expect(fetcher.mock.calls[0][0]).toBe('https://storage.example/photo.jpg');
    const body = JSON.parse(fetcher.mock.calls[1][1].body as string);
    expect(body.contents[0].parts[1].inlineData).toMatchObject({ mimeType: 'image/jpeg' });
    expect(JSON.stringify(body)).not.toContain('storage.example');
  });
});

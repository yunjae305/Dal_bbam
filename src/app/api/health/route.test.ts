import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/health/route';

vi.mock('@/backend/supabase/env', () => ({
  getSupabaseEnv: () => ({ authConfigured: true, configured: true })
}));

describe('GET /api/health', () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiKey;
  });

  it.each([undefined, '', '   '])('reports AI as unavailable for an empty server key', async value => {
    if (value === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = value;

    const payload = await GET().json();

    expect(payload.readiness.ai).toBe(false);
  });

  it('returns only readiness and never exposes the server key', async () => {
    const serverOnlyKey = 'server-only-test-value';
    process.env.OPENAI_API_KEY = serverOnlyKey;

    const response = GET();
    const payload = await response.json();

    expect(payload.readiness.ai).toBe(true);
    expect(JSON.stringify(payload)).not.toContain(serverOnlyKey);
    expect(payload).not.toHaveProperty('OPENAI_API_KEY');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiProvider, isAiAvailable } from './ai';

describe('AI provider selection', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('uses Gemini when its key is set and the feature is on', () => {
    vi.stubEnv('FEATURE_AI', 'true');
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    expect(aiProvider()).toBe('gemini');
    expect(isAiAvailable()).toBe(true);
  });

  it('stays off while the feature flag is false even with a key', () => {
    vi.stubEnv('FEATURE_AI', 'false');
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    expect(aiProvider()).toBe('none');
    expect(isAiAvailable()).toBe(false);
  });
});

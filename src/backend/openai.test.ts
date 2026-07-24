import { describe, expect, it } from 'vitest';
import {
  containsPersonalInformation,
  narrationCacheKey
} from '@/backend/openai';

describe('OpenAI boundary helpers', () => {
  it('builds a stable cache key from source content and prompt version', () => {
    const first = narrationCacheKey('123', 'ko', 'same overview', 'v1');
    const second = narrationCacheKey('123', 'ko', 'same overview', 'v1');
    expect(first).toBe(second);
    expect(narrationCacheKey('123', 'ko', 'changed overview', 'v1')).not.toBe(first);
    expect(narrationCacheKey('123', 'en', 'same overview', 'v1')).not.toBe(first);
  });

  it('detects email and Korean phone number patterns before moderation', () => {
    expect(containsPersonalInformation('contact me at test@example.com')).toBe(true);
    expect(containsPersonalInformation('010-1234-5678로 연락')).toBe(true);
    expect(containsPersonalInformation('경주 여행이 즐거웠어요')).toBe(false);
  });
});

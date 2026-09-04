import { describe, expect, it } from 'vitest';
import {
  containsPersonalInformation,
  decodeGeneratedPng,
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

  it('decodes only bounded PNG base64 payloads from the Image API', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(decodeGeneratedPng(png.toString('base64'))).toEqual(png);
    expect(() => decodeGeneratedPng('not-base64!')).toThrow(/base64/i);
    expect(() => decodeGeneratedPng(Buffer.from('jpeg').toString('base64'))).toThrow(/PNG/i);
  });
});

import { describe, expect, it } from 'vitest';
import {
  containsPersonalInformation,
  decodeGeneratedPng,
  moderateContentLocally,
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

  it.each([
    '연락처 ０１０－１２３４－５６７８',
    'mail: te\u200Bst@example.com',
    '주민등록번호 990101-1234567',
    'Call +1 (212) 555-0199',
    'passport: M12345678',
    '계좌번호: 123-456-789012'
  ])('screens sensitive identifier patterns: %s', text => {
    expect(containsPersonalInformation(text)).toBe(true);
    expect(moderateContentLocally(text).allowed).toBe(false);
  });

  it.each(['씨 발', '시.발', 'f\u200Buck', '操你妈', '死ね'])('blocks profanity across supported languages: %s', text => {
    expect(moderateContentLocally(text)).toMatchObject({ allowed: false, categories: { harassment: true } });
  });

  it.each(['2026-09-06, 09:30에 방문해요.', '시발점에서 출발하는 경주 산책', 'A beautiful heritage walk in Scunthorpe.'])('keeps ordinary travel details: %s', text => {
    expect(moderateContentLocally(text).allowed).toBe(true);
  });

  it('decodes only bounded PNG base64 payloads from the Image API', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(decodeGeneratedPng(png.toString('base64'))).toEqual(png);
    expect(() => decodeGeneratedPng('not-base64!')).toThrow(/base64/i);
    expect(() => decodeGeneratedPng(Buffer.from('jpeg').toString('base64'))).toThrow(/PNG/i);
  });
});

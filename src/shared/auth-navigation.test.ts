import { describe, expect, it } from 'vitest';
import { safeNextPath } from './auth-navigation';

describe('post-login navigation', () => {
  it('preserves a stamp checkpoint or selected schedule', () => {
    expect(safeNextPath('/stamps?checkpoint=abc')).toBe('/stamps?checkpoint=abc');
    expect(safeNextPath('/schedule?id=abc#day2')).toBe('/schedule?id=abc#day2');
  });
  it.each([null, '//evil.example', '/\\evil.example', 'https://evil.example', '/\n/evil.example', '/api/auth/logout', '/login?next=/login', '/a/../api/auth/demo'])('rejects unsafe destination %s', value => {
    expect(safeNextPath(value)).toBe('/');
  });
});

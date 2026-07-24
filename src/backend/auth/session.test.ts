import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, verifySessionToken } from '@/backend/auth/session';

afterEach(() => {
  vi.unstubAllEnvs();
});

const user = {
  sub: '3d8679b9-9a93-5c32-a92d-67b852b94af0',
  email: 'traveler@example.com',
  provider: 'password' as const
};

describe('session signing configuration', () => {
  it('allows an isolated development secret for local prototypes', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('JWT_SECRET', '');
    vi.stubEnv('SESSION_SECRET', '');
    expect(verifySessionToken(createSessionToken(user))).toMatchObject(user);
  });

  it('fails closed when the production secret is missing or too short', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'too-short');
    vi.stubEnv('SESSION_SECRET', '');
    expect(() => createSessionToken(user)).toThrow(/at least 32 characters/);
  });

  it('signs and verifies production sessions with a strong configured secret', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', '0123456789abcdef0123456789abcdef');
    const token = createSessionToken(user);
    expect(verifySessionToken(token)).toMatchObject(user);
  });
});

import { createHash, createHmac, timingSafeEqual } from 'crypto';

const COOKIE_NAME = 'gy_session';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일
const ISSUER = 'dal-bbam';
const AUDIENCE = 'dal-bbam-web';
const DEVELOPMENT_SECRET = 'dal-bbam-local-development-secret-change-me';

export const SESSION_COOKIE = COOKIE_NAME;
export const SESSION_COOKIE_MAX_AGE = Math.floor(TTL_MS / 1000);

export type SessionProvider = 'password' | 'kakao' | 'demo';

interface Payload {
  sub: string;
  email: string | null;
  name?: string;
  provider: SessionProvider;
  sessionId?: string;
  iss: typeof ISSUER;
  aud: typeof AUDIENCE;
  iat: number;
  exp: number;
}

export type SessionUser = Pick<Payload, 'sub' | 'email' | 'name' | 'provider' | 'sessionId'>;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET ?? process.env.SESSION_SECRET;

  if (secret && secret.length >= 32) {
    return secret;
  }

  if (process.env.NODE_ENV !== 'production') {
    return DEVELOPMENT_SECRET;
  }

  throw new Error('JWT_SECRET must be configured with at least 32 characters in production.');
}

export function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/'
  };
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(input: string): string {
  return createHmac('sha256', getJwtSecret()).update(input).digest('base64url');
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, 'base64url');
  const expectedBuffer = Buffer.from(expected, 'base64url');

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createStableUserId(provider: SessionProvider, externalId: string): string {
  const bytes = createHash('sha256').update(`${provider}:${externalId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createSessionToken(user: SessionUser): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const payload = base64UrlJson({
    ...user,
    iss: ISSUER,
    aud: AUDIENCE,
    iat: now,
    exp: now + Math.floor(TTL_MS / 1000)
  } satisfies Payload);
  const unsigned = `${header}.${payload}`;

  return `${unsigned}.${sign(unsigned)}`;
}

export function verifySessionToken(token: string): SessionUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    if (!encodedHeader || !encodedPayload || !signature) return null;

    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString()) as {
      alg?: string;
      typ?: string;
    };
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;

    const expected = sign(`${encodedHeader}.${encodedPayload}`);
    if (!signaturesMatch(signature, expected)) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as Payload;
    const now = Math.floor(Date.now() / 1000);
    if (
      payload.iss !== ISSUER ||
      payload.aud !== AUDIENCE ||
      !['password', 'kakao', 'demo'].includes(payload.provider) ||
      typeof payload.sub !== 'string' ||
      (payload.email !== null && typeof payload.email !== 'string') ||
      (payload.sessionId !== undefined && typeof payload.sessionId !== 'string') ||
      (payload.provider === 'kakao' && !/^[0-9a-f-]{36}$/i.test(payload.sessionId ?? '')) ||
      !Number.isInteger(payload.iat) ||
      !Number.isInteger(payload.exp) ||
      payload.iat > now + 60 ||
      payload.exp <= now ||
      payload.exp - payload.iat > Math.floor(TTL_MS / 1000)
    ) {
      return null;
    }

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      provider: payload.provider,
      sessionId: payload.sessionId
    };
  } catch {
    return null;
  }
}

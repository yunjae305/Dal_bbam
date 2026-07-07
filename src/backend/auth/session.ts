import { createHmac, timingSafeEqual } from 'crypto';

const COOKIE_NAME = 'gy_session';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

export const SESSION_COOKIE = COOKIE_NAME;

interface Payload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET ?? process.env.SESSION_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production.');
  }

  return 'gyeongju-travel-dev-secret';
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(input: string): string {
  return createHmac('sha256', getJwtSecret()).update(input).digest('base64url');
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createSessionToken(email: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const payload = base64UrlJson({
    sub: email,
    email,
    iat: now,
    exp: now + Math.floor(TTL_MS / 1000)
  } satisfies Payload);
  const unsigned = `${header}.${payload}`;

  return `${unsigned}.${sign(unsigned)}`;
}

export function verifySessionToken(token: string): { email: string } | null {
  try {
    const [header, encodedPayload, signature] = token.split('.');
    if (!header || !encodedPayload || !signature) return null;

    const expected = sign(`${header}.${encodedPayload}`);
    if (!signaturesMatch(signature, expected)) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as Payload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

import { createHmac } from 'crypto';

const SECRET = process.env.SESSION_SECRET ?? 'gyeongju-travel-default-secret-2024';
const COOKIE_NAME = 'gy_session';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

export const SESSION_COOKIE = COOKIE_NAME;

interface Payload {
  email: string;
  exp: number;
}

export function createSessionToken(email: string): string {
  const payload: Payload = { email, exp: Date.now() + TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): { email: string } | null {
  try {
    const dot = token.lastIndexOf('.');
    if (dot === -1) return null;
    const encoded = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = createHmac('sha256', SECRET).update(encoded).digest('base64url');
    if (expected !== sig) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as Payload;
    if (payload.exp < Date.now()) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

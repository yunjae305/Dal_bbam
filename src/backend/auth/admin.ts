import { timingSafeEqual } from 'node:crypto';
import { getCurrentUser, type CurrentUser } from '@/backend/auth/current-user';

function safeTextEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function configuredAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminUser(user: CurrentUser | null): boolean {
  return Boolean(user?.email && configuredAdminEmails().has(user.email.trim().toLowerCase()));
}

export async function authorizeAdminRequest(request: Request): Promise<{
  authorized: boolean;
  user: CurrentUser | null;
  method: 'session' | 'secret' | null;
}> {
  const user = await getCurrentUser();
  if (isAdminUser(user)) return { authorized: true, user, method: 'session' };

  const configuredSecret = process.env.ADMIN_API_SECRET?.trim() ?? '';
  const authorization = request.headers.get('authorization') ?? '';
  const suppliedSecret = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';
  const secretUsable = configuredSecret.length >= 32;

  if (secretUsable && suppliedSecret && safeTextEqual(suppliedSecret, configuredSecret)) {
    return { authorized: true, user, method: 'secret' };
  }

  return { authorized: false, user, method: null };
}


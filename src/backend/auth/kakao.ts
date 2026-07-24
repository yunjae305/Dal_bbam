const KAKAO_AUTH_URL = 'https://kauth.kakao.com/oauth/authorize';
const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const KAKAO_USER_URL = 'https://kapi.kakao.com/v2/user/me';

export const KAKAO_STATE_COOKIE = 'kakao_oauth_state';
export const KAKAO_STATE_TTL_SECONDS = 10 * 60;

type KakaoTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type KakaoUserResponse = {
  id?: number | string;
  kakao_account?: {
    email?: string;
    is_email_valid?: boolean;
    is_email_verified?: boolean;
    profile?: {
      nickname?: string;
    };
  };
};

export type KakaoProfile = {
  providerUserId: string;
  email: string | null;
  name: string;
};

export class KakaoApiError extends Error {
  constructor(
    public readonly stage: 'token' | 'user',
    message: string
  ) {
    super(message);
    this.name = 'KakaoApiError';
  }
}

export function getKakaoRestApiKey(): string | null {
  // KAKAO_CLIENT_ID is retained as a temporary fallback for existing deployments.
  return process.env.KAKAO_REST_API_KEY?.trim()
    || process.env.KAKAO_CLIENT_ID?.trim()
    || null;
}

export function getKakaoRedirectUri(): string {
  const redirectUri = process.env.KAKAO_REDIRECT_URI?.trim();

  if (!redirectUri) {
    throw new Error('KAKAO_REDIRECT_URI is not configured.');
  }

  return assertHttpUrl(redirectUri, 'KAKAO_REDIRECT_URI').toString();
}

export function getFrontendUrl(fallbackOrigin: string): URL {
  return assertHttpUrl(
    process.env.FRONTEND_URL?.trim() || fallbackOrigin,
    'FRONTEND_URL'
  );
}

function assertHttpUrl(value: string, name: string): URL {
  const url = new URL(value);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${name} must use http or https.`);
  }

  return url;
}

export function buildKakaoAuthorizeUrl(state: string): URL {
  const restApiKey = getKakaoRestApiKey();

  if (!restApiKey) {
    throw new Error('KAKAO_REST_API_KEY is not configured.');
  }

  const url = new URL(KAKAO_AUTH_URL);
  url.searchParams.set('client_id', restApiKey);
  url.searchParams.set('redirect_uri', getKakaoRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);

  return url;
}

export async function exchangeKakaoCode(code: string): Promise<string> {
  const restApiKey = getKakaoRestApiKey();

  if (!restApiKey) {
    throw new KakaoApiError('token', 'KAKAO_REST_API_KEY is not configured.');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: restApiKey,
    redirect_uri: getKakaoRedirectUri(),
    code
  });
  const clientSecret = process.env.KAKAO_CLIENT_SECRET?.trim();

  if (clientSecret) {
    body.set('client_secret', clientSecret);
  }

  let response: Response;

  try {
    response = await fetch(KAKAO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        Accept: 'application/json'
      },
      body,
      cache: 'no-store'
    });
  } catch {
    throw new KakaoApiError('token', 'Kakao token endpoint could not be reached.');
  }

  const token = await readJson<KakaoTokenResponse>(response);

  if (!response.ok || !token?.access_token) {
    throw new KakaoApiError(
      'token',
      token?.error_description || token?.error || 'Kakao token exchange failed.'
    );
  }

  return token.access_token;
}

export async function getKakaoUser(accessToken: string): Promise<KakaoProfile> {
  let response: Response;

  try {
    response = await fetch(KAKAO_USER_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      },
      cache: 'no-store'
    });
  } catch {
    throw new KakaoApiError('user', 'Kakao user endpoint could not be reached.');
  }

  const user = await readJson<KakaoUserResponse>(response);

  if (!response.ok || user?.id === undefined || user.id === null) {
    throw new KakaoApiError('user', 'Kakao user profile lookup failed.');
  }

  const account = user.kakao_account;
  const email = typeof account?.email === 'string'
    && account.is_email_valid !== false
    && account.is_email_verified !== false
    ? account.email.trim().toLowerCase()
    : null;

  return {
    providerUserId: String(user.id),
    email: email || null,
    name: account?.profile?.nickname?.trim() || '카카오 사용자'
  };
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}

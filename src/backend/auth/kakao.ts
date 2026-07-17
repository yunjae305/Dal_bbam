const KAKAO_AUTH_URL = 'https://kauth.kakao.com/oauth/authorize';
const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const KAKAO_USER_URL = 'https://kapi.kakao.com/v2/user/me';

export const KAKAO_STATE_COOKIE = 'kakao_oauth_state';

type KakaoTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type KakaoUserResponse = {
  id?: number;
  kakao_account?: {
    email?: string;
    profile?: {
      nickname?: string;
    };
  };
  properties?: {
    nickname?: string;
  };
};

export function getKakaoClientId(): string | null {
  return process.env.KAKAO_CLIENT_ID?.trim() || null;
}

export function getKakaoRedirectUri(origin: string): string {
  return process.env.KAKAO_REDIRECT_URI?.trim() || `${origin}/api/auth/kakao/callback`;
}

export function buildKakaoAuthorizeUrl(params: {
  origin: string;
  state: string;
}) {
  const clientId = getKakaoClientId();

  if (!clientId) {
    throw new Error('KAKAO_CLIENT_ID is not configured.');
  }

  const url = new URL(KAKAO_AUTH_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', getKakaoRedirectUri(params.origin));
  url.searchParams.set('state', params.state);
  url.searchParams.set('scope', 'profile_nickname,account_email');

  return url;
}

export async function exchangeKakaoCode(params: {
  origin: string;
  code: string;
}) {
  const clientId = getKakaoClientId();

  if (!clientId) {
    throw new Error('KAKAO_CLIENT_ID is not configured.');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    redirect_uri: getKakaoRedirectUri(params.origin),
    code: params.code
  });
  const clientSecret = process.env.KAKAO_CLIENT_SECRET?.trim();

  if (clientSecret) {
    body.set('client_secret', clientSecret);
  }

  const response = await fetch(KAKAO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
    },
    body,
    cache: 'no-store'
  });
  const token = await response.json() as KakaoTokenResponse;

  if (!response.ok || !token.access_token) {
    throw new Error(token.error_description || token.error || 'Failed to exchange Kakao authorization code.');
  }

  return token.access_token;
}

export async function getKakaoUser(accessToken: string) {
  const response = await fetch(KAKAO_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    },
    cache: 'no-store'
  });
  const user = await response.json() as KakaoUserResponse;

  if (!response.ok || !user.id) {
    throw new Error('Failed to load Kakao user profile.');
  }

  const email = user.kakao_account?.email || `kakao_${user.id}@kakao.local`;
  const name = user.kakao_account?.profile?.nickname || user.properties?.nickname || '카카오 사용자';

  return {
    id: String(user.id),
    email,
    name
  };
}

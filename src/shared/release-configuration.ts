/** Pure, redacted validation shared by the release CLI and runtime health route. */
export type ReleaseEnvironment = Record<string, string | undefined>;
export type ReleaseIssue = { code: string; fields: string[]; message: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const reservedHost = /(^|\.)(localhost|invalid|test|example|example\.com|example\.org|example\.net)$/i;

export function publicHttpsUrl(value: string | undefined): URL | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || reservedHost.test(host)
      || !domainPattern.test(host)
      || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
    return url;
  } catch { return null; }
}

export function usableReleaseSecret(value: string | undefined): boolean {
  const secret = value?.trim() ?? '';
  return secret.length >= 32 && new Set(secret).size >= 8
    && !/replace[-_ ]|change[-_ ]?me|local[-_ ]e2e|ci[-_ ]only|local-development-secret|server-only-test/i.test(secret);
}

function realEmail(value: string) {
  const host = value.split('@')[1] ?? '';
  return emailPattern.test(value) && domainPattern.test(host) && !reservedHost.test(host);
}

export function validateReleaseConfiguration(env: ReleaseEnvironment) {
  const issues: ReleaseIssue[] = [];
  const add = (code: string, fields: string[], message: string) => issues.push({ code, fields, message });
  const frontend = publicHttpsUrl(env.FRONTEND_URL);
  if (!frontend || frontend.pathname !== '/' || frontend.search || frontend.hash) {
    add('PUBLIC_ORIGIN_REQUIRED', ['FRONTEND_URL'], '실제 배포할 HTTPS 오리진을 설정하세요. 로컬·예시 주소는 사용할 수 없습니다.');
  }
  const callback = publicHttpsUrl(env.KAKAO_REDIRECT_URI);
  if (!frontend || !callback || callback.origin !== frontend.origin
    || callback.pathname !== '/api/auth/kakao/callback' || callback.search || callback.hash) {
    add('KAKAO_CALLBACK_MISMATCH', ['KAKAO_REDIRECT_URI', 'FRONTEND_URL'], '카카오 콜백 주소를 운영 오리진의 /api/auth/kakao/callback과 일치시키세요.');
  }
  const declared = (env.KAKAO_MAP_JS_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (!frontend || !declared.some(value => {
    const parsed = publicHttpsUrl(value);
    return parsed?.origin === frontend.origin && parsed.pathname === '/' && !parsed.search && !parsed.hash;
  })) add('KAKAO_MAP_ORIGIN_REQUIRED', ['KAKAO_MAP_JS_ALLOWED_ORIGINS'], '운영 오리진을 지도 허용 목록과 카카오 콘솔 양쪽에 등록하세요.');

  if (!publicHttpsUrl(env.NEXT_PUBLIC_SUPABASE_URL)) {
    add('SUPABASE_URL_REQUIRED', ['NEXT_PUBLIC_SUPABASE_URL'], '운영 Supabase HTTPS 주소가 필요합니다.');
  }
  for (const field of ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'TOUR_API_KEY', 'KAKAO_REST_API_KEY', 'NEXT_PUBLIC_KAKAO_MAP_JS_KEY']) {
    if (!env[field]?.trim()) add('PROVIDER_KEY_REQUIRED', [field], '사용할 서비스의 키가 설정되지 않았습니다.');
  }
  if (!usableReleaseSecret(env.JWT_SECRET ?? env.SESSION_SECRET)) {
    add('SESSION_SECRET_INVALID', ['JWT_SECRET'], '예시값이 아닌 32자 이상의 무작위 세션 비밀키가 필요합니다.');
  }
  if (!usableReleaseSecret(env.CRON_SECRET)) {
    add('CRON_SECRET_INVALID', ['CRON_SECRET'], '정기 데이터 정리 작업용 32자 이상의 무작위 비밀키가 필요합니다.');
  }
  if (env.ADMIN_API_SECRET?.trim() && !usableReleaseSecret(env.ADMIN_API_SECRET)) {
    add('ADMIN_SECRET_INVALID', ['ADMIN_API_SECRET'], '관리자 API 비밀키를 사용한다면 32자 이상의 무작위 값을 지정하세요.');
  }
  const admins = (env.ADMIN_EMAILS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (!admins.length || admins.some(value => !realEmail(value))) {
    add('ADMIN_EMAIL_REQUIRED', ['ADMIN_EMAILS'], '관리 화면을 운영할 실제 계정 이메일이 필요합니다.');
  }
  if (env.DEMO_MODE_ENABLED?.trim().toLowerCase() !== 'false' || env.DEMO_ISOLATED_TEST === 'true') {
    add('DEMO_MUST_BE_DISABLED', ['DEMO_MODE_ENABLED', 'DEMO_ISOLATED_TEST'], '공개 배포에서는 데모 로그인과 격리 테스트 모드를 끄세요.');
  }
  const operator = env.PUBLIC_OPERATOR_NAME?.trim() ?? '';
  if (operator.length < 2 || /미설정|입력하세요|your.company|example|운영자명/i.test(operator)) {
    add('OPERATOR_REQUIRED', ['PUBLIC_OPERATOR_NAME'], '실제 서비스 운영자명을 설정하세요.');
  }
  if (!realEmail(env.PRIVACY_CONTACT_EMAIL?.trim() ?? '')) {
    add('PRIVACY_CONTACT_REQUIRED', ['PRIVACY_CONTACT_EMAIL'], '실제 개인정보 문의 이메일을 설정하세요.');
  }
  const date = env.LOCATION_TERMS_EFFECTIVE_DATE?.trim() ?? '';
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    add('POLICY_DATE_REQUIRED', ['LOCATION_TERMS_EFFECTIVE_DATE'], '정책 시행일을 실제 YYYY-MM-DD 날짜로 설정하세요.');
  }
  const aiFlag = env.FEATURE_AI?.trim().toLowerCase();
  if (!['true', 'false'].includes(aiFlag ?? '')) {
    add('AI_MODE_REQUIRED', ['FEATURE_AI'], 'AI 사용 여부를 true 또는 false로 명시하세요. 키를 쓰지 않으면 기본 추천으로 동작합니다.');
  } else if (aiFlag === 'true' && !env.OPENAI_API_KEY?.trim()) {
    add('AI_KEY_REQUIRED', ['OPENAI_API_KEY'], 'AI를 켠 상태에는 서버용 OpenAI API 키가 필요합니다.');
  }
  return { ready: issues.length === 0, issues };
}

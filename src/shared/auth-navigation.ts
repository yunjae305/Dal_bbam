export const AUTH_NEXT_COOKIE = 'dal_bbam_auth_next';

/** Post-login links must remain on this site and cannot invoke an API or a login loop. */
export function safeNextPath(requested: string | null | undefined): string {
  if (!requested?.startsWith('/') || requested.startsWith('//') || /[\\\u0000-\u0020]/.test(requested)) return '/';
  try {
    const url = new URL(requested, 'https://dal-bbam.invalid');
    if (url.origin !== 'https://dal-bbam.invalid' || /^\/(api|login)(\/|$)/.test(url.pathname)) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return '/'; }
}

import { cookies } from 'next/headers';
import { isLang, localeCookieName } from '@/shared/i18n';
import type { Lang } from '@/shared/types';

export async function getRequestLocale(): Promise<Lang> {
  const cookieStore = await cookies();
  const value = cookieStore.get(localeCookieName)?.value;
  return isLang(value) ? value : 'ko';
}

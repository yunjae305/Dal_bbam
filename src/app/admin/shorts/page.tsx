import { getCurrentUser } from '@/backend/auth/current-user';
import { isAdminUser } from '@/backend/auth/admin';
import { getRequestLocale } from '@/backend/request-locale';
import { getTourMvpData } from '@/backend/tour-mvp-data';
import { DirectPageShell } from '@/frontend/components/common/direct-page-shell';
import { ShortsEditor } from '@/frontend/components/travel/shorts-editor';
import { shortsAdminMessages } from '@/shared/shorts-admin-messages';

export default async function ShortsAdminPage() {
  const lang = await getRequestLocale();
  if (!isAdminUser(await getCurrentUser())) {
    return <DirectPageShell><p role="alert" className="p-6 text-sm">{shortsAdminMessages[lang].denied}</p></DirectPageShell>;
  }
  const data = await getTourMvpData(lang);
  return <DirectPageShell><ShortsEditor places={data.places} /></DirectPageShell>;
}

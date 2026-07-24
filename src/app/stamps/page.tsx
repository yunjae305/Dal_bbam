import { DirectPageShell } from '@/frontend/components/common/direct-page-shell';
import { StampTourScreen } from '@/frontend/components/travel/stamp-tour-screen';
import { getTourMvpData } from '@/backend/tour-mvp-data';
import { getRequestLocale } from '@/backend/request-locale';

export default async function StampsPage() {
  const data = await getTourMvpData(await getRequestLocale());
  return <DirectPageShell><div className="mx-auto max-w-[700px] py-4"><StampTourScreen places={data.places} /></div></DirectPageShell>;
}

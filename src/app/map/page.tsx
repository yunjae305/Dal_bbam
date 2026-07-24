import { DirectPageShell } from '@/frontend/components/common/direct-page-shell';
import { MapPageScreen } from '@/frontend/components/travel/map-page-screen';
import { getTourMvpData } from '@/backend/tour-mvp-data';
import { getRequestLocale } from '@/backend/request-locale';

export default async function MapPage() {
  const data = await getTourMvpData(await getRequestLocale());
  return <DirectPageShell><MapPageScreen places={data.places} /></DirectPageShell>;
}

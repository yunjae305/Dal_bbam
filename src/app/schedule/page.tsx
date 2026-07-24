import { DirectPageShell } from '@/frontend/components/common/direct-page-shell';
import { ItineraryScreen } from '@/frontend/components/travel/itinerary-screen';
import { getTourMvpData } from '@/backend/tour-mvp-data';
import { getRequestLocale } from '@/backend/request-locale';

export default async function SchedulePage() {
  const data = await getTourMvpData(await getRequestLocale());
  return <DirectPageShell><div className="mx-auto max-w-[640px]"><ItineraryScreen places={data.places} /></div></DirectPageShell>;
}

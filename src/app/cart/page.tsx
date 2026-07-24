import { DirectPageShell } from '@/frontend/components/common/direct-page-shell';
import { TravelCartScreen } from '@/frontend/components/travel/travel-cart-screen';
import { getTourMvpData } from '@/backend/tour-mvp-data';
import { getRequestLocale } from '@/backend/request-locale';
import { getCurrentUser } from '@/backend/auth/current-user';

export default async function CartPage() {
  const [data, user] = await Promise.all([
    getTourMvpData(await getRequestLocale()),
    getCurrentUser()
  ]);
  return <DirectPageShell><div className="mx-auto max-w-[640px]"><TravelCartScreen places={data.places} userEmail={user?.email} /></div></DirectPageShell>;
}

import { TravelMvpApp } from '@/frontend/components/travel-mvp-app';
import { getMvpData } from '@/backend/data';

export default function Page() {
  return <TravelMvpApp initialData={getMvpData()} />;
}

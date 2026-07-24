import { PlaceDetailScreen } from '@/frontend/components/travel/place-detail-screen';

export default async function PlacePage({ params }: { params: Promise<{ contentId: string }> }) {
  const { contentId } = await params;
  return <PlaceDetailScreen contentId={contentId} />;
}

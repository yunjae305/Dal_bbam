import { DirectPageShell } from '@/frontend/components/common/direct-page-shell';
import { CommunityDetailScreen } from '@/frontend/components/travel/community-detail-screen';

export default async function CommunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DirectPageShell><CommunityDetailScreen id={id} /></DirectPageShell>;
}

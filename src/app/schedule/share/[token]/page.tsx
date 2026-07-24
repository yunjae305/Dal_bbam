import { DirectPageShell } from '@/frontend/components/common/direct-page-shell';
import { SharedPlanScreen } from '@/frontend/components/travel/shared-plan-screen';

export default async function SharedSchedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <DirectPageShell><SharedPlanScreen kind="schedule" token={token} /></DirectPageShell>;
}

import { DirectPageShell } from '@/frontend/components/common/direct-page-shell';
import { SharedPlanScreen } from '@/frontend/components/travel/shared-plan-screen';

export default async function SharedCoursePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <DirectPageShell publicView><SharedPlanScreen kind="course" token={token} /></DirectPageShell>;
}

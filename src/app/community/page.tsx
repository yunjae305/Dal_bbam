import { DirectPageShell } from '@/frontend/components/common/direct-page-shell';
import { CommunityScreen } from '@/frontend/components/travel/community-screen';

export default function CommunityPage() {
  return <DirectPageShell><div className="mx-auto max-w-[700px]"><CommunityScreen /></div></DirectPageShell>;
}

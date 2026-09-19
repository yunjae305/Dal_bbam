import { DirectPageShell } from '@/frontend/components/common/direct-page-shell';
import { ShortsScreen } from '@/frontend/components/travel/shorts-screen';
import { isShortsFeedEnabled } from '@/backend/features';

export default function ShortsPage() {
  return <DirectPageShell><ShortsScreen feedEnabled={isShortsFeedEnabled()} /></DirectPageShell>;
}

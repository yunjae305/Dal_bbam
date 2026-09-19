import { DirectPageShell } from '@/frontend/components/common/direct-page-shell';
import { PwaInstallCard } from '@/frontend/components/pwa-install';

export default function InstallPage() {
  return <DirectPageShell publicView><div className="px-5 py-8"><PwaInstallCard /></div></DirectPageShell>;
}

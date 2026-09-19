'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Download, CheckCircle2 } from 'lucide-react';
import { useLocale } from '@/frontend/i18n/locale-context';
import { pwaMessages } from '@/shared/pwa-messages';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
const InstallContext = createContext({ available: false, installed: false, ios: false, install: async () => {} });

export function PwaInstallProvider({ children }: { children: React.ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    const display = window.matchMedia('(display-mode: standalone)');
    const refresh = () => setInstalled(display.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    refresh();
    setIos(/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', onInstalled);
    display.addEventListener('change', refresh);
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', onInstalled);
      display.removeEventListener('change', refresh);
    };
  }, []);
  async function install() {
    if (!prompt) return;
    setPrompt(null); // A browser install event can only be used once.
    await prompt.prompt();
    await prompt.userChoice;
  }
  return <InstallContext.Provider value={{ available: Boolean(prompt), installed, ios, install }}>{children}</InstallContext.Provider>;
}

export function PwaInstallCard() {
  const { locale } = useLocale();
  const ui = pwaMessages[locale];
  const { available, installed, ios, install } = useContext(InstallContext);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  async function startInstall() {
    setFailed(false);
    setBusy(true);
    try { await install(); } catch { setFailed(true); } finally { setBusy(false); }
  }
  return <section className="rounded-3xl bg-white p-6 shadow-sm" aria-labelledby="install-title">
    <Download size={30} className="text-[#2f7567]" aria-hidden="true" />
    <h1 id="install-title" className="mt-4 text-balance text-2xl font-black">{ui.title}</h1>
    <p className="mt-3 text-pretty text-sm leading-6 text-[#65706c]">{ui.description}</p>
    {installed ? <p className="mt-5 flex items-center gap-2 text-sm font-bold text-[#2f7567]" role="status"><CheckCircle2 size={18} />{ui.installed}</p>
      : available ? <button type="button" onClick={() => void startInstall()} disabled={busy} className="mt-5 min-h-12 w-full rounded-xl bg-[#12372f] px-4 font-bold text-white transition-transform active:scale-[0.96] disabled:opacity-60">{ui.install}</button>
        : <p className="mt-5 rounded-xl bg-[#eef3ee] p-4 text-sm leading-6">{ios ? ui.ios : ui.manual}</p>}
    {failed && <p role="alert" className="mt-3 text-sm text-red-800">{ui.failed}</p>}
  </section>;
}

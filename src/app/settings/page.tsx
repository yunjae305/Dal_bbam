'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, LoaderCircle, ShieldCheck, UserRound, UserX } from 'lucide-react';
import { DirectPageShell } from '@/frontend/components/common/direct-page-shell';
import { useLocale } from '@/frontend/i18n/locale-context';
import { uiMessages } from '@/shared/ui-messages';

type Account = { email: string | null; name: string | null; provider: string };
type BlockedUser = { id: string; name: string | null; blockedAt: string };

export default function SettingsPage() {
  const { locale } = useLocale();
  const ui = uiMessages[locale].settings;
  const [account, setAccount] = useState<Account | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState<BlockedUser[] | null>(null);
  const [blockError, setBlockError] = useState('');
  const [unblocking, setUnblocking] = useState('');

  useEffect(() => {
    if (!account) return;
    void fetch('/api/community/blocks', { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json().catch(() => null) as { data?: BlockedUser[] } | null;
        if (!response.ok) throw new Error();
        setBlocked(payload?.data ?? []);
      })
      .catch(() => setBlockError(ui.blockedLoadFailed));
  }, [account, ui.blockedLoadFailed]);

  async function unblock(id: string) {
    setUnblocking(id);
    setBlockError('');
    try {
      const response = await fetch(`/api/community/blocks?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error();
      setBlocked(current => current?.filter(item => item.id !== id) ?? current);
    } catch {
      setBlockError(ui.unblockFailed);
    } finally {
      setUnblocking('');
    }
  }

  useEffect(() => {
    void fetch('/api/account', { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json().catch(() => null) as { data?: Account; error?: { message?: string } } | null;
        if (response.status === 401) {
          window.location.replace('/login');
          return;
        }
        if (!response.ok) {
          setError(payload?.error?.message ?? ui.loadFailed);
          return;
        }
        setAccount(payload?.data ?? null);
      })
      .catch(() => setError(ui.loadFailed));
  }, [ui.loadFailed]);

  async function deleteAccount() {
    if (confirmation !== 'DELETE') return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/account', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation })
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) setError(payload.error?.message ?? ui.deleteFailed);
      else window.location.replace('/login');
    } catch {
      setError(ui.networkError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DirectPageShell>
      <section className="px-5 py-6">
        <header className="rounded-[28px] bg-[#12372f] p-6 text-white shadow-[0_16px_42px_rgba(18,55,47,0.2)]">
          <UserRound size={34} />
          <h1 className="mt-4 text-balance text-2xl font-black">{ui.title}</h1>
          <p className="mt-2 text-pretty text-sm text-white/75">{account?.name || ui.traveler} · {account?.email || account?.provider || ui.loading}</p>
        </header>

        <div className="mt-5 grid gap-3">
          <Link href="/legal/terms" className="flex min-h-14 items-center gap-3 rounded-2xl bg-white px-4 font-bold shadow-sm transition-transform active:scale-[0.96]"><ShieldCheck size={20} />{ui.terms}</Link>
          <Link href="/legal/privacy" className="flex min-h-14 items-center gap-3 rounded-2xl bg-white px-4 font-bold shadow-sm transition-transform active:scale-[0.96]"><ShieldCheck size={20} />{ui.privacy}</Link>
          <Link href="/legal/location" className="flex min-h-14 items-center gap-3 rounded-2xl bg-white px-4 font-bold shadow-sm transition-transform active:scale-[0.96]"><ShieldCheck size={20} />{ui.locationTerms}</Link>
        </div>

        <section className="mt-8 rounded-[24px] bg-white p-5 shadow-sm" aria-labelledby="blocked-users-title" aria-busy={blocked === null && !blockError}>
          <div className="flex items-center gap-2"><UserX size={20} /><h2 id="blocked-users-title" className="font-black">{ui.blockedTitle}</h2></div>
          <p className="mt-2 text-pretty text-xs leading-5 text-[#65706c]">{ui.blockedDescription}</p>
          {blockError && <p role="alert" className="mt-3 text-xs font-bold text-red-800">{blockError}</p>}
          {blocked === null && !blockError && <LoaderCircle className="mt-3 animate-spin text-[#65706c]" size={18} aria-label={ui.loading} />}
          {blocked?.length === 0 && <p className="mt-3 text-xs text-[#65706c]">{ui.blockedEmpty}</p>}
          {!!blocked?.length && (
            <ul className="mt-3 divide-y divide-black/5">
              {blocked.map(item => (
                <li key={item.id} className="flex min-h-14 items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{item.name || ui.traveler}</span>
                    <span className="block text-[11px] text-[#65706c]">{new Date(item.blockedAt).toLocaleDateString(locale)}</span>
                  </span>
                  <button type="button" onClick={() => void unblock(item.id)} disabled={unblocking === item.id} className="flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-[#eef1ef] px-4 text-xs font-bold transition-transform active:scale-[0.96] disabled:opacity-50">
                    {unblocking === item.id && <LoaderCircle className="animate-spin" size={14} />}{ui.unblock}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8 rounded-[24px] bg-red-50 p-5 text-red-950 ring-1 ring-red-200">
          <div className="flex items-center gap-2"><AlertTriangle size={20} /><h2 className="font-black">{ui.deleteTitle}</h2></div>
          <p className="mt-2 text-pretty text-xs leading-5 text-red-800">{ui.deleteDescription}</p>
          <input value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-4 min-h-12 w-full rounded-xl bg-white px-4 font-mono outline-none ring-1 ring-red-200 focus:ring-4 focus:ring-red-200" aria-label={ui.deleteConfirmLabel} />
          {error && <p role="alert" className="mt-3 text-xs font-bold">{error}</p>}
          <button type="button" onClick={() => void deleteAccount()} disabled={confirmation !== 'DELETE' || loading} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-700 font-bold text-white transition-[transform,opacity] active:scale-[0.96] disabled:opacity-40">{loading && <LoaderCircle className="animate-spin" size={17} />}{ui.deleteAction}</button>
        </section>
      </section>
    </DirectPageShell>
  );
}

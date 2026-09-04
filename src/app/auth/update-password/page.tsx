'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, LoaderCircle, LockKeyhole } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/frontend/supabase/client';
import { useLocale } from '@/frontend/i18n/locale-context';
import { uiMessages } from '@/shared/ui-messages';

export default function UpdatePasswordPage() {
  const { locale } = useLocale();
  const ui = uiMessages[locale].auth;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (password.length < 8) return setError(ui.minEight);
    if (password !== confirm) return setError(ui.passwordMismatch);

    const supabase = createSupabaseBrowserClient();
    if (!supabase) return setError(ui.authUnavailable);
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) return setError(ui.updateFailed);
    setComplete(true);
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#eef3ee] px-5 text-[#202725]">
      <section className="w-full max-w-[390px] rounded-[28px] bg-white p-6 shadow-[0_18px_60px_rgba(19,55,47,0.14)]">
        {complete ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto text-[#2f7567]" size={42} />
            <h1 className="mt-4 text-balance text-xl font-black">{ui.updated}</h1>
            <Link href="/" className="mt-6 flex min-h-11 items-center justify-center rounded-xl bg-[#12372f] font-bold text-white transition-transform active:scale-[0.96]">{ui.returnService}</Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            <LockKeyhole className="text-[#2f7567]" size={34} />
            <h1 className="mt-4 text-balance text-xl font-black">{ui.setNewPassword}</h1>
            <p className="mt-2 text-pretty text-sm text-[#65706c]">{ui.passwordHint}</p>
            <label className="mt-6 block text-sm font-bold">{ui.newPassword}<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required className="mt-2 min-h-12 w-full rounded-xl border border-[#dfe6e2] px-4 outline-none focus:border-[#2f7567] focus:ring-4 focus:ring-[#2f7567]/10" /></label>
            <label className="mt-4 block text-sm font-bold">{ui.passwordConfirm}<input type="password" value={confirm} onChange={event => setConfirm(event.target.value)} autoComplete="new-password" minLength={8} required className="mt-2 min-h-12 w-full rounded-xl border border-[#dfe6e2] px-4 outline-none focus:border-[#2f7567] focus:ring-4 focus:ring-[#2f7567]/10" /></label>
            {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
            <button type="submit" disabled={loading} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#12372f] font-bold text-white transition-[transform,opacity] active:scale-[0.96] disabled:opacity-60">{loading && <LoaderCircle className="animate-spin" size={17} />}{ui.change}</button>
          </form>
        )}
      </section>
    </main>
  );
}

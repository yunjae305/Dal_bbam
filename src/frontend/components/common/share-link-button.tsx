'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Copy, Share2, X } from 'lucide-react';
import { useLocale } from '@/frontend/i18n/locale-context';
import { shareMessages } from '@/shared/share-messages';

type ShareFallback = { data: ShareData; reason: 'unsupported' | 'failed' };

export function ShareLinkButton({ path, title, text, label, className }: {
  path: string;
  title: string;
  text?: string;
  label: string;
  className?: string;
}) {
  const { locale } = useLocale();
  const ui = shareMessages[locale];
  const [fallback, setFallback] = useState<ShareFallback | null>(null);
  const [busy, setBusy] = useState(false);
  const sharing = useRef(false);

  async function share(data: ShareData) {
    if (sharing.current) return;
    if (typeof navigator.share !== 'function') {
      setFallback({ data, reason: 'unsupported' });
      return;
    }
    sharing.current = true;
    setBusy(true);
    try {
      // Keep this call in the click handler, before any await, to preserve activation.
      await navigator.share(data);
      setFallback(null);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
        setFallback(null);
        return;
      }
      setFallback({ data, reason: 'failed' });
    } finally {
      sharing.current = false;
      setBusy(false);
    }
  }

  return <>
    <button type="button" disabled={busy} onClick={() => void share({ title, text, url: new URL(path, window.location.origin).href })} className={className} aria-label={label}>
      <Share2 size={18} />
    </button>
    {fallback && <ShareFallbackDialog fallback={fallback} busy={busy} ui={ui} onRetry={() => void share(fallback.data)} onDismiss={() => setFallback(null)} />}
  </>;
}

function ShareFallbackDialog({ fallback, busy, ui, onRetry, onDismiss }: {
  fallback: ShareFallback;
  busy: boolean;
  ui: typeof shareMessages['ko'];
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  const [notice, setNotice] = useState('');

  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    // Close before React removes the node so the browser restores focus to
    // the trigger. A passive effect cleanup runs after removal and loses it.
    return () => { element?.close(); };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(fallback.data.url ?? '');
      setNotice(ui.copied);
    } catch {
      setNotice(ui.copyFailed);
    }
  }

  return <dialog ref={dialog} aria-labelledby={headingId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); onDismiss(); }}
    className="fixed inset-0 m-auto w-[calc(100%-32px)] max-w-sm rounded-2xl border-0 bg-white p-5 text-[#303642] shadow-xl backdrop:bg-black/50">
    <div className="flex items-center justify-between gap-3">
      <h2 id={headingId} className="text-lg font-black">{ui.title}</h2>
      <button type="button" onClick={onDismiss} aria-label={ui.close} className="grid h-11 w-11 place-items-center rounded-full bg-[#f3f4f2]"><X size={18} /></button>
    </div>
    <p className="mt-2 text-sm font-bold">{fallback.data.title}</p>
    <p id={descriptionId} className="mt-3 text-sm leading-6 text-[#616a67]">{ui[fallback.reason]}</p>
    <div className="mt-4 space-y-3">
      {fallback.reason === 'failed' && <button type="button" disabled={busy} onClick={onRetry} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#223c72] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><Share2 size={18} />{ui.retry}</button>}
      <button type="button" onClick={() => void copy()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#eef3ee] px-4 py-3 text-sm font-bold text-[#2f7567]"><Copy size={18} />{ui.copy}</button>
      {notice && <p role="status" className="text-sm leading-6">{notice}</p>}
      <input aria-label={ui.link} readOnly value={fallback.data.url ?? ''} onFocus={event => event.currentTarget.select()} className="w-full rounded-lg border border-[#d8d1c7] p-3 text-sm" />
    </div>
  </dialog>;
}

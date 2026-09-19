'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/frontend/i18n/locale-context';
import { pwaMessages } from '@/shared/pwa-messages';

export function ServiceWorkerRegister() {
  const { locale } = useLocale();
  const ui = pwaMessages[locale];
  const [offline, setOffline] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const acceptedRef = useRef(false);

  useEffect(() => {
    const refresh = () => setOffline(!navigator.onLine);
    refresh();
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;

    let disposed = false;
    let reloading = false;
    const hadController = Boolean(navigator.serviceWorker.controller);
    const announceUpdate = () => { if (!disposed) { setUpdateReady(true); setDismissed(false); } };
    const onControllerChange = () => {
      if (!hadController || reloading) return;
      // Another tab can activate the worker, but must not discard this tab's form.
      if (!acceptedRef.current) { announceUpdate(); return; }
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    let registration: ServiceWorkerRegistration | null = null;
    const observed = new Set<ServiceWorker>();
    const onStateChange = () => {
      if (registration?.waiting && navigator.serviceWorker.controller) announceUpdate();
    };
    const onUpdateFound = () => {
      const worker = registration?.installing;
      if (!worker || observed.has(worker)) return;
      observed.add(worker);
      worker.addEventListener('statechange', onStateChange);
    };
    const checkForUpdate = () => {
      if (document.visibilityState === 'visible') void registration?.update().catch(() => undefined);
    };
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then(result => {
        if (disposed) return;
        registration = result;
        registrationRef.current = result;
        result.addEventListener('updatefound', onUpdateFound);
        onUpdateFound();
        onStateChange();
        document.addEventListener('visibilitychange', checkForUpdate);
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', checkForUpdate);
      registration?.removeEventListener('updatefound', onUpdateFound);
      observed.forEach(worker => worker.removeEventListener('statechange', onStateChange));
    };
  }, []);

  function update() {
    acceptedRef.current = true;
    if (registrationRef.current?.waiting) registrationRef.current.waiting.postMessage('SKIP_WAITING');
    else window.location.reload();
  }

  if (!offline && (!updateReady || dismissed)) return null;
  return <aside className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] left-1/2 z-50 w-[calc(100%-32px)] max-w-[398px] -translate-x-1/2 rounded-2xl bg-[#12372f] p-4 text-white shadow-xl" aria-live="polite">
    {offline ? <><p className="text-sm leading-6">{ui.offline}</p><a href="/offline" className="mt-2 inline-flex min-h-11 items-center underline underline-offset-4">{ui.saved}</a></>
      : <><p className="text-sm font-bold">{ui.update}</p><p className="mt-1 text-xs leading-5 text-white/80">{ui.updateHint}</p>
        <div className="mt-2 flex gap-2"><button type="button" onClick={update} className="min-h-11 rounded-xl bg-white px-4 text-sm font-bold text-[#12372f]">{ui.reload}</button><button type="button" onClick={() => setDismissed(true)} className="min-h-11 rounded-xl px-4 text-sm">{ui.later}</button></div></>}
  </aside>;
}

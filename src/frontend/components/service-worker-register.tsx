'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let reloading = false;
    const hadController = Boolean(navigator.serviceWorker.controller);
    const onControllerChange = () => {
      // A new worker took over an already-controlled page: reload once so the
      // installed PWA picks up the new build instead of mixing old chunks.
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    let registration: ServiceWorkerRegistration | null = null;
    const checkForUpdate = () => {
      if (document.visibilityState === 'visible') void registration?.update().catch(() => undefined);
    };
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then(result => {
        registration = result;
        document.addEventListener('visibilitychange', checkForUpdate);
      })
      .catch(() => undefined);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', checkForUpdate);
    };
  }, []);

  return null;
}

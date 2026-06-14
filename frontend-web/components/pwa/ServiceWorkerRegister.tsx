'use client';

import { useEffect } from 'react';

// Registered only in production: the dev server's unhashed chunks must not be
// cached, or hot reloads serve stale code.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  return null;
}

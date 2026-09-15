'use client';

import { useEffect } from 'react';

export default function PwaRegister() {
  useEffect(() => {
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const err = event.reason;
      if (!err) return;
      const isChunkError =
        err.name === 'ChunkLoadError' ||
        (typeof err.message === 'string' &&
          /loading chunk|failed to fetch dynamically imported module/i.test(err.message));
      if (isChunkError) window.location.reload();
    }
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) =>
        console.error('Service worker registration failed:', err)
      );
    }

    return () => window.removeEventListener('unhandledrejection', onUnhandledRejection);
  }, []);

  return null;
}

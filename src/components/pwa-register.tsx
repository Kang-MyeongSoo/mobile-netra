'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

export default function PwaRegister() {
  const [showUpdate, setShowUpdate] = useState(false);
  const waitingWorker = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    // ChunkLoadError 시 자동 새로고침
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

    if (!('serviceWorker' in navigator)) {
      return () => window.removeEventListener('unhandledrejection', onUnhandledRejection);
    }

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // 이미 waiting 중인 SW가 있으면 바로 알림
      if (reg.waiting) {
        waitingWorker.current = reg.waiting;
        setShowUpdate(true);
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorker.current = newWorker;
            setShowUpdate(true);
          }
        });
      });
    }).catch((err) => console.error('Service worker registration failed:', err));

    // 새 SW가 제어권 가져가면 리로드
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloading) { reloading = true; window.location.reload(); }
    });

    return () => window.removeEventListener('unhandledrejection', onUnhandledRejection);
  }, []);

  function handleUpdate() {
    waitingWorker.current?.postMessage({ type: 'SKIP_WAITING' });
  }

  if (!showUpdate) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white text-sm px-4 py-3 rounded-2xl shadow-xl">
      <span>새 버전이 있어요</span>
      <button
        onClick={handleUpdate}
        className="flex items-center gap-1.5 bg-white text-gray-900 font-semibold text-xs px-3 py-1.5 rounded-xl"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        새로고침
      </button>
    </div>
  );
}

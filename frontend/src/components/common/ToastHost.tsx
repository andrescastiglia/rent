'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { subscribeToToasts, type ToastMessage } from '@/lib/toastBus';

type VisibleToast = ToastMessage & { id: number };

export function ToastHost() {
  const [toast, setToast] = useState<VisibleToast | null>(null);

  // We only translate auth/common for now (the only current use-case).
  const tAuth = useTranslations('auth');

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const unsubscribe = subscribeToToasts((incoming) => {
      const id = Date.now();
      setToast({ ...incoming, id });

      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => setToast(null), 5000);
    });

    return () => {
      if (timeout) clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  if (!toast) return null;

  const message = toast.namespace === 'auth' ? tAuth(toast.key as any) : `${toast.namespace}.${toast.key}`;

  return (
    <div
      className="fixed right-4 top-4 z-50 max-w-sm rounded border px-4 py-3"
      style={{ background: 'var(--background)', color: 'var(--foreground)' }}
      role="status"
      aria-live="polite"
    >
      <div className="text-sm">{message}</div>
    </div>
  );
}

"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  busy = false,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  busy?: boolean;
}>) {
  const t = useTranslations("ui");
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const trigger = document.activeElement as HTMLElement | null;
    dialog.showModal();
    closeRef.current?.focus();
    return () => {
      dialog.close();
      trigger?.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      aria-busy={busy || undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="ui-surface fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-xl max-h-[85dvh] overflow-y-auto p-0 backdrop:bg-black/40"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line p-5">
        <div>
          <h2 id={`${id}-title`} className="text-lg font-semibold">
            {title}
          </h2>
          {description && (
            <p id={`${id}-description`} className="mt-1 text-sm text-muted">
              {description}
            </p>
          )}
        </div>
        <button
          ref={closeRef}
          type="button"
          className="btn btn-ghost shrink-0 px-3"
          disabled={busy}
          onClick={onClose}
          aria-label={t("close")}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="p-5">{children}</div>
      {actions && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-line p-5">
          {actions}
        </div>
      )}
    </dialog>
  );
}

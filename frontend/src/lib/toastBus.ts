export type ToastKind = "error" | "success" | "info";

export type ToastMessage = {
  kind: ToastKind;
  namespace: string;
  key: string;
};

type ToastListener = (toast: ToastMessage) => void;

const DEDUPE_WINDOW_MS = 8000;
const lastToastAtById: Record<string, number> = {};

const target: EventTarget | null =
  typeof globalThis === "undefined" ? null : new EventTarget();

export function emitToast(toast: ToastMessage): void {
  if (!target) return;

  const id = `${toast.namespace}.${toast.key}.${toast.kind}`;
  const now = Date.now();
  const lastAt = lastToastAtById[id] ?? 0;

  if (now - lastAt < DEDUPE_WINDOW_MS) return;
  lastToastAtById[id] = now;

  target.dispatchEvent(
    new CustomEvent<ToastMessage>("toast", { detail: toast }),
  );
}

export function subscribeToToasts(listener: ToastListener): () => void {
  if (!target) return () => {};

  const handler = (event: Event) => {
    const custom = event as CustomEvent<ToastMessage>;
    listener(custom.detail);
  };

  target.addEventListener("toast", handler);
  return () => target.removeEventListener("toast", handler);
}

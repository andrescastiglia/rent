"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
type DocumentStatus = {
  status: "queued" | "completed" | "dead_letter" | "unavailable";
  available: boolean;
};
type DocumentApi = {
  status(id: string): Promise<DocumentStatus>;
  download(id: string): Promise<void>;
};
type Props = Readonly<{
  documentId: string;
  scopeKey: string;
  api: DocumentApi;
  messages: string;
}>;
export function RecoverableDocument(props: Props) {
  return (
    <DocumentContent
      key={`${props.scopeKey}:${props.documentId}`}
      documentId={props.documentId}
      api={props.api}
      messages={props.messages}
    />
  );
}
function DocumentContent({
  documentId,
  api,
  messages,
}: Omit<Props, "scopeKey">) {
  const t = useTranslations(messages);
  const [state, setState] = useState<DocumentStatus | null>(null);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState<string | null>(null);
  const mounted = useRef(true),
    inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    api.status(documentId).then(
      (value) => {
        if (active) {
          setState(value);
          setBusy(false);
        }
      },
      () => {
        if (active) {
          setError("readError");
          setBusy(false);
        }
      },
    );
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [documentId, api]);
  const refresh = async () => {
    if (busy || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const value = await api.status(documentId);
      if (mounted.current) {
        setState(value);
        setError(null);
      }
    } catch {
      if (mounted.current) setError("readError");
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const download = async () => {
    if (busy || inFlight.current || error || !state?.available) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await api.download(documentId);
    } catch {
      if (mounted.current) setError("downloadError");
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const status = state?.status;
  let statusLabel = state?.available ? "available" : "unavailable";
  if (status === "queued") statusLabel = "queued";
  if (status === "dead_letter") statusLabel = "deadLetter";
  return (
    <section
      aria-label={t("title")}
      aria-busy={busy}
      className="space-y-3 rounded-lg border p-4"
    >
      <h3 className="font-semibold">{t("title")}</h3>
      {error && <p role="alert">{t(error)}</p>}
      {state && !error && <output>{t(statusLabel)}</output>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {busy ? t("loading") : t("refresh")}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || !!error || !state?.available}
          onClick={() => void download()}
        >
          {t("download")}
        </button>
      </div>
    </section>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  contractDocumentsApi as api,
  type LeaseContractStatusDto,
} from "@/lib/api/contract-documents";
export function ContractDocument(
  props: Readonly<{ leaseId: string; scopeKey: string }>,
) {
  return (
    <ContractDocumentContent
      key={`${props.scopeKey}:${props.leaseId}`}
      leaseId={props.leaseId}
    />
  );
}
function ContractDocumentContent({ leaseId }: Readonly<{ leaseId: string }>) {
  const t = useTranslations("contractDocument");
  const [state, setState] = useState<LeaseContractStatusDto | null>(null);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState<string | null>(null);
  const mounted = useRef(true),
    inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    api.status(leaseId).then(
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
  }, [leaseId]);
  const refresh = async () => {
    if (busy || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const value = await api.status(leaseId);
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
      await api.download(leaseId);
    } catch {
      if (mounted.current) setError("downloadError");
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const status = state?.status;
  return (
    <section
      aria-label={t("title")}
      aria-busy={busy}
      className="space-y-3 rounded-lg border p-4"
    >
      <h3 className="font-semibold">{t("title")}</h3>
      {error && <p role="alert">{t(error)}</p>}
      {state && !error && (
        <p role="status">
          {t(
            status === "queued"
              ? "queued"
              : status === "dead_letter"
                ? "deadLetter"
                : state.available
                  ? "available"
                  : "unavailable",
          )}
        </p>
      )}
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

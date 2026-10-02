"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { bfaApi, type BfaLeaseOverview } from "@/lib/api/bfa";

export function BfaStamps({ leaseId }: Readonly<{ leaseId: string }>) {
  const t = useTranslations("bfa");
  const [overview, setOverview] = useState<BfaLeaseOverview | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    bfaApi.forLease(leaseId).then(
      (result) => {
        if (active) {
          setOverview(result);
          setBusy(false);
        }
      },
      () => {
        if (active) {
          setError(true);
          setBusy(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [leaseId]);

  const refresh = async (documentId?: string) => {
    setBusy(true);
    setError(false);
    try {
      if (documentId) await bfaApi.request(documentId);
      setOverview(await bfaApi.forLease(leaseId));
    } catch {
      // Do not automatically resubmit after an uncertain request. Refresh reads only.
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={t("title")} aria-busy={busy} className="space-y-3">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-sm">{t("description")}</p>
      {overview && !overview.enabled && <output>{t("disabled")}</output>}
      {error && <p role="alert">{t("error")}</p>}
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={busy}
        onClick={() => {
          void refresh();
        }}
      >
        {busy ? t("loading") : t("refresh")}
      </button>
      {overview?.documents.length === 0 && <p>{t("empty")}</p>}
      <ul className="space-y-4">
        {overview?.documents.map((document) => (
          <li key={document.id} className="space-y-2">
            <h3 className="font-medium">{document.name}</h3>
            <output>{t(`status.${document.status ?? "none"}`)}</output>
            {!document.currentVersion && <p>{t("changed")}</p>}
            {document.sha256 && (
              <details>
                <summary>{t("proof")}</summary>
                <p className="break-all">SHA-256: {document.sha256}</p>
                {document.proof?.stamps.map((stamp, index) => (
                  <p key={`${stamp.blocknumber}-${index}`}>
                    {t("block", { number: stamp.blocknumber })}
                    {" · "}
                    <time
                      dateTime={new Date(
                        stamp.blocktimestamp * 1000,
                      ).toISOString()}
                    >
                      {new Date(stamp.blocktimestamp * 1000).toISOString()}
                    </time>
                  </p>
                ))}
              </details>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              aria-label={t("requestDocument", { name: document.name })}
              disabled={
                busy ||
                error ||
                !overview.enabled ||
                (!!document.status && document.currentVersion)
              }
              onClick={() => {
                void refresh(document.id);
              }}
            >
              {t("request")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

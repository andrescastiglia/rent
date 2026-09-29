"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  authorizationDestination,
  mercadoLibreApi,
  type MercadoLibreCallback,
  type MercadoLibreStatus,
} from "@/lib/api/mercadolibre";

export function MercadoLibreConnection({
  callback,
  navigate = (url) => window.location.assign(url),
}: Readonly<{
  callback?: MercadoLibreCallback | null;
  navigate?: (url: string) => void;
}>) {
  const t = useTranslations("mercadoLibre");
  const [status, setStatus] = useState<MercadoLibreStatus | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [callbackUsed, setCallbackUsed] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const inFlight = useRef(false);
  const consumed = useRef(false);

  useEffect(() => {
    let active = true;
    mercadoLibreApi.status().then(
      (result) => {
        if (active) {
          setStatus(result);
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
  }, []);

  const run = async (
    operation: "refresh" | "begin" | "complete" | "disconnect",
  ) => {
    if (inFlight.current || busy) return;
    if (
      (operation === "begin" || operation === "complete") &&
      (!status?.enabled || error)
    )
      return;
    if (operation === "complete" && (!callback || consumed.current)) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    setConfirmDisconnect(false);
    try {
      if (operation === "begin") {
        const response = await mercadoLibreApi.begin();
        navigate(authorizationDestination(response.authorizationUrl));
      } else if (operation === "complete") {
        consumed.current = true;
        setCallbackUsed(true);
        setStatus(await mercadoLibreApi.complete(callback!));
        setCompleted(true);
      } else {
        if (operation === "disconnect") setCompleted(false);
        setStatus(
          await (operation === "disconnect"
            ? mercadoLibreApi.disconnect()
            : mercadoLibreApi.status()),
        );
      }
    } catch {
      // Never replay a code after a lost response; the operator can read status or start anew.
      setError(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <section
      aria-label={t("title")}
      aria-busy={busy}
      className="space-y-4 rounded-lg border p-5"
    >
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p>{t("description")}</p>
      {status && !status.enabled && <p role="status">{t("disabled")}</p>}
      {status && <p role="status">{t(`status.${status.status}`)}</p>}
      {status?.sellerId && <p>{t("seller", { id: status.sellerId })}</p>}
      {error && <p role="alert">{t("error")}</p>}
      {callback === null && <p role="alert">{t("invalidCallback")}</p>}
      {completed && <p role="status">{t("completed")}</p>}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void run("refresh")}
        >
          {busy ? t("loading") : t("refresh")}
        </button>
        {callback && !callbackUsed && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || error || !status?.enabled}
            onClick={() => void run("complete")}
          >
            {t("complete")}
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || error || !status?.enabled}
          onClick={() => void run("begin")}
        >
          {t("connect")}
        </button>
        {status &&
          !["unconfigured", "disconnected"].includes(status.status) && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || error}
              onClick={() => setConfirmDisconnect(true)}
            >
              {t("disconnect")}
            </button>
          )}
      </div>
      {confirmDisconnect && (
        <div className="space-y-3 rounded border p-4">
          <p>{t("disconnectHint")}</p>
          <button
            type="button"
            className="btn btn-secondary mr-3"
            onClick={() => setConfirmDisconnect(false)}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void run("disconnect")}
          >
            {t("confirmDisconnect")}
          </button>
        </div>
      )}
    </section>
  );
}

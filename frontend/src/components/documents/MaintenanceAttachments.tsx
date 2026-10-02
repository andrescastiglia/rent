"use client";
import { useEffect, useRef, useState } from "react";
import { ApiRequestError } from "@/lib/api";
import { useTranslations } from "next-intl";
import { Button, FormField, StatePanel, Surface } from "@/components/ui";
import {
  maintenanceAttachmentsApi,
  type MaintenanceAttachment,
} from "@/lib/api/maintenance-attachments";

export default function MaintenanceAttachments({
  ticketId,
}: Readonly<{ ticketId: string }>) {
  const t = useTranslations("maintenanceAttachments");
  const [items, setItems] = useState<MaintenanceAttachment[]>([]);
  const [file, setFile] = useState<File>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState(false);
  const [revision, setRevision] = useState(0);
  const [uncertain, setUncertain] = useState(false);
  const active = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    maintenanceAttachmentsApi
      .list(ticketId)
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch(() => {
        if (!cancelled) setError("readError");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId, revision]);
  async function upload() {
    if (!file || active.current) return;
    active.current = true;
    setBusy(true);
    setError(undefined);
    setSuccess(false);
    try {
      await maintenanceAttachmentsApi.upload(ticketId, file);
      setFile(undefined);
      setUncertain(false);
      setSuccess(true);
      setRevision((value) => value + 1);
    } catch (error_) {
      const rejected =
        !uncertain &&
        error_ instanceof ApiRequestError &&
        [400, 401, 403, 404, 409, 415, 422].includes(error_.status);
      setUncertain(!rejected);
      setError(rejected ? "rejected" : "uploadError");
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  async function download(attachment: MaintenanceAttachment) {
    try {
      await maintenanceAttachmentsApi.download(attachment);
    } catch {
      setError("downloadError");
    }
  }
  return (
    <Surface className="space-y-3 p-4">
      <h3 className="font-semibold">{t("title")}</h3>
      {loading && <StatePanel busy title={t("loading")} />}
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-line pb-2"
          >
            <span className="min-w-0 break-all text-sm">
              {item.name}
              <span className="block text-xs text-muted">
                {t(item.status === "approved" ? "ready" : "pending")}
              </span>
            </span>
            <Button
              variant="secondary"
              disabled={item.status !== "approved"}
              onClick={() => void download(item)}
            >
              {t("download")}
            </Button>
          </li>
        ))}
      </ul>
      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-muted">{t("empty")}</p>
      )}
      <FormField
        id={`ticket-attachment-${ticketId}`}
        label={t("file")}
        help={t("help")}
      >
        {(attributes) => (
          <input
            {...attributes}
            className="ui-field"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            disabled={busy || uncertain}
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              setSuccess(false);
              if (
                chosen &&
                (![
                  "application/pdf",
                  "image/jpeg",
                  "image/png",
                  "image/webp",
                ].includes(chosen.type) ||
                  chosen.size < 1 ||
                  chosen.size > 5 * 1024 * 1024)
              ) {
                setFile(undefined);
                setError("invalidFile");
              } else {
                setFile(chosen);
                setError(undefined);
              }
            }}
          />
        )}
      </FormField>
      <Button
        variant="secondary"
        busy={busy}
        disabled={!file}
        onClick={() => void upload()}
      >
        {t(uncertain ? "recover" : "upload")}
      </Button>
      {error && (
        <StatePanel
          error
          title={t(error)}
          action={
            error === "readError" ? (
              <Button
                variant="secondary"
                onClick={() => setRevision((value) => value + 1)}
              >
                {t("retry")}
              </Button>
            ) : undefined
          }
        />
      )}
      {success && <output className="block text-sm">{t("success")}</output>}
    </Surface>
  );
}

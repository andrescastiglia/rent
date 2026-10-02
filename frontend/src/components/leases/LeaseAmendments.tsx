"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AmendmentWorkflow } from "./AmendmentWorkflow";
import type { AmendmentScope } from "@/lib/amendment-workflow";
import { ApiRequestError } from "@/lib/api";
import {
  amendmentsApi as api,
  type AmendmentReviewDto,
  type LeaseAmendment,
  type ReviewAmendmentDto,
} from "@/lib/api/amendments";

const inputClass =
  "block w-full rounded border p-2 bg-white text-gray-900 dark:bg-gray-900 dark:text-white";
const buttonClass = "rounded border px-3 py-2 disabled:opacity-50";
type Selection = {
  amendment: LeaseAmendment;
  action: ReviewAmendmentDto["action"];
};
type PendingReview = { id: string; dto: ReviewAmendmentDto };

function AmendmentValues({
  values,
}: Readonly<{ values: Record<string, unknown> }>) {
  const t = useTranslations("amendments");
  const fields = new Set([
    "monthlyRent",
    "lastAdjustmentDate",
    "endDate",
    "status",
    "termsAndConditions",
    "specialClauses",
    "applicationStatus",
    "applicationError",
    "effectiveDate",
    "changeType",
    "newValues",
    "appliedAt",
    "applicationSnapshot",
    "approvedBy",
    "approvedAt",
  ]);
  const label = (key: string) => {
    if (key === "before" || key === "after") return t(key);
    return fields.has(key) ? t(`fields.${key}`) : key;
  };
  const displayValue = (value: unknown) => {
    if (value == null) return t("none");
    if (Array.isArray(value)) return JSON.stringify(value);
    if (typeof value === "object")
      return <AmendmentValues values={value as Record<string, unknown>} />;
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  };
  return (
    <dl className="space-y-2 text-sm">
      {Object.entries(values).map(([key, value]) => (
        <div key={key} className="pl-2">
          <dt className="font-medium">{label(key)}</dt>
          <dd className="whitespace-pre-wrap break-words">
            {displayValue(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function LeaseAmendments({
  leaseId,
  canReview,
  onChanged,
  workflow,
}: Readonly<{
  leaseId: string;
  canReview: boolean;
  onChanged: () => Promise<void>;
  workflow?: {
    scope: AmendmentScope;
    active: boolean;
    rental: boolean;
    currency: string;
  };
}>) {
  const t = useTranslations("amendments");
  const [workflowLocked, setWorkflowLocked] = useState(false);
  const [items, setItems] = useState<LeaseAmendment[]>([]);
  const [busy, setBusy] = useState(true);
  const [readError, setReadError] = useState(false);
  const [writeError, setWriteError] = useState<"uncertain" | "rejected" | null>(
    null,
  );
  const [selection, setSelection] = useState<Selection | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<PendingReview | null>(null);
  const [history, setHistory] = useState<{
    id: string;
    rows: AmendmentReviewDto[];
  } | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const inFlight = useRef(false),
    mounted = useRef(true);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    api.list(leaseId).then(
      (rows) => {
        if (active) {
          setItems(rows);
          setBusy(false);
        }
      },
      () => {
        if (active) {
          setReadError(true);
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
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const rows = await api.list(leaseId);
      if (mounted.current) {
        setItems(rows);
        setReadError(false);
      }
    } catch {
      if (mounted.current) setReadError(true);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const showHistory = async (id: string) => {
    if (inFlight.current || !canReview) return;
    inFlight.current = true;
    setBusy(true);
    setHistoryError(false);
    setHistory(null);
    try {
      const rows = await api.history(id);
      if (mounted.current) setHistory({ id, rows });
    } catch {
      if (mounted.current) setHistoryError(true);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const select = (
    amendment: LeaseAmendment,
    action: ReviewAmendmentDto["action"],
  ) => {
    setSelection({ amendment, action });
    setReason("");
    setConfirmed(false);
    setWriteError(null);
  };
  const submit = async () => {
    if (
      inFlight.current ||
      !canReview ||
      !selection ||
      (!pending && (!confirmed || reason.trim().length < 10 || readError))
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setWriteError(null);
    try {
      const attempt = pending ?? {
        id: selection.amendment.id,
        dto: {
          action: selection.action,
          reason: reason.trim(),
          expectedUpdatedAt: selection.amendment.updatedAt,
          idempotencyKey: crypto.randomUUID(),
        },
      };
      setPending(attempt);
      const result = await api.review(attempt.id, attempt.dto);
      if (!mounted.current) return;
      setItems((rows) =>
        rows.map((item) =>
          item.id === result.amendment.id ? result.amendment : item,
        ),
      );
      setPending(null);
      setSelection(null);
      setHistory(null);
      // A parent refresh failure must never cause the completed mutation to be sent again.
      try {
        await onChanged();
      } catch {
        if (mounted.current) setReadError(true);
      }
    } catch (error) {
      if (!mounted.current) return;
      if (
        error instanceof ApiRequestError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        setPending(null);
        setSelection(null);
        setReadError(true);
        setWriteError("rejected");
      } else setWriteError("uncertain");
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <section
      className="space-y-4 rounded-lg border p-4"
      aria-label={t("title")}
      aria-busy={busy}
    >
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-sm">{t("description")}</p>
      <button
        type="button"
        className={buttonClass}
        disabled={busy || workflowLocked}
        onClick={() => {
          void refresh();
        }}
      >
        {busy ? t("loading") : t("refresh")}
      </button>
      {readError && <p role="alert">{t("readError")}</p>}
      {writeError && <p role="alert">{t(writeError)}</p>}
      {historyError && <p role="alert">{t("historyError")}</p>}
      {!busy && !readError && items.length === 0 && <p>{t("empty")}</p>}
      <ul className="space-y-4">
        {items.map((item) => {
          const canCancel =
            ["draft", "pending_approval", "approved"].includes(item.status) &&
            item.applicationStatus !== "applied" &&
            !item.appliedAt;
          const canSchedule =
            item.status === "approved" &&
            item.applicationStatus === "legacy_review";
          return (
            <li key={item.id} className="space-y-2 border-t pt-3">
              <h3 className="font-semibold">
                {t("number", { number: item.amendmentNumber })}
              </h3>
              <p>{item.description}</p>
              <p>
                {t("effectiveDate")}:{" "}
                <time dateTime={item.effectiveDate}>
                  {item.effectiveDate.slice(0, 10)}
                </time>
              </p>
              <p>
                {t(`status.${item.status}`)} ·{" "}
                {t(`application.${item.applicationStatus}`)}
              </p>
              {item.applicationError && (
                <output>{item.applicationError}</output>
              )}
              {item.appliedAt && (
                <p>
                  {t("appliedAt")}:{" "}
                  <time dateTime={item.appliedAt}>{item.appliedAt}</time>
                </p>
              )}
              <details>
                <summary>{t("changes")}</summary>
                <AmendmentValues values={item.newValues} />
              </details>
              {item.applicationSnapshot && (
                <details>
                  <summary>{t("evidence")}</summary>
                  <AmendmentValues values={item.applicationSnapshot} />
                </details>
              )}
              {canReview && (
                <div className="flex flex-wrap gap-2">
                  {canCancel && (
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={
                        busy || workflowLocked || readError || !!pending
                      }
                      onClick={() => select(item, "cancel")}
                    >
                      {t("cancel")}
                    </button>
                  )}
                  {canSchedule && (
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={
                        busy || workflowLocked || readError || !!pending
                      }
                      onClick={() => select(item, "schedule")}
                    >
                      {t("schedule")}
                    </button>
                  )}
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy || workflowLocked}
                    onClick={() => {
                      void showHistory(item.id);
                    }}
                  >
                    {t("history")}
                  </button>
                </div>
              )}
              {history?.id === item.id && (
                <div aria-label={t("history")} className="space-y-2">
                  {history.rows.length === 0 && <p>{t("noHistory")}</p>}
                  {history.rows.map((row) => (
                    <div key={row.id} className="border-l pl-3">
                      <p>
                        {t(row.action)} ·{" "}
                        <time dateTime={row.performedAt}>
                          {row.performedAt}
                        </time>
                      </p>
                      <p>{row.reason}</p>
                      <p className="break-all">
                        {t("reviewer")}: {row.performedBy}
                      </p>
                      <details>
                        <summary>{t("evidence")}</summary>
                        <AmendmentValues
                          values={{ before: row.before, after: row.after }}
                        />
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {workflow && (
        <AmendmentWorkflow
          {...workflow}
          items={items}
          disabled={busy || readError || !!pending || !!selection}
          onLockChange={setWorkflowLocked}
          onCompleted={async () => {
            try {
              const rows = await api.list(leaseId);
              if (mounted.current) {
                setItems(rows);
                setReadError(false);
                await onChanged();
              }
            } catch (error) {
              if (mounted.current) setReadError(true);
              throw error;
            }
          }}
        />
      )}
      {selection && canReview && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <fieldset className="space-y-3 rounded border p-3">
            <legend>
              {t(selection.action)} ·{" "}
              {t("number", { number: selection.amendment.amendmentNumber })}
            </legend>
            <p>
              {t(
                selection.action === "cancel"
                  ? "cancelDescription"
                  : "scheduleDescription",
              )}
            </p>
            <p>
              {t("effectiveDate")}:{" "}
              {selection.amendment.effectiveDate.slice(0, 10)}
            </p>
            <label className="block">
              {t("reason")}
              <textarea
                className={inputClass}
                minLength={10}
                maxLength={2000}
                required
                value={reason}
                disabled={busy || !!pending}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy || !!pending}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              {t("confirm")}
            </label>
            <div className="flex gap-2">
              <button
                className={buttonClass}
                type="submit"
                disabled={
                  busy ||
                  (!pending &&
                    (!confirmed || reason.trim().length < 10 || readError))
                }
              >
                {pending ? t("recover") : t("submit")}
              </button>
              <button
                className={buttonClass}
                type="button"
                disabled={busy || !!pending}
                onClick={() => setSelection(null)}
              >
                {t("back")}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  amendmentsApi as api,
  type LeaseAmendment,
} from "@/lib/api/amendments";
import { ApiRequestError } from "@/lib/api";
import {
  amendmentDraft,
  prepareAmendmentAttempt,
  completeAmendmentAttempt,
  type AmendmentDraft,
  type AmendmentAttempt,
  type AmendmentDraftFields,
  type AmendmentScope,
} from "@/lib/amendment-workflow";

type Action = "submit" | "approve" | "reject";
type Operation =
  | { action: "create"; dto: AmendmentDraft }
  | { action: Action; id: string; expectedUpdatedAt: string };
type Selection = { action: Action; amendment: LeaseAmendment };
const inputClass =
  "block w-full rounded border p-2 bg-white text-gray-900 dark:bg-gray-900 dark:text-white";
const buttonClass = "rounded border px-3 py-2 disabled:opacity-50";
const types: AmendmentDraftFields["changeType"][] = [
  "rent_increase",
  "rent_decrease",
  "extension",
  "early_termination",
  "clause_modification",
  "guarantor_change",
  "other",
];

export function AmendmentWorkflow({
  scope,
  items,
  active,
  rental,
  currency,
  disabled,
  onLockChange,
  onCompleted,
}: Readonly<{
  scope: AmendmentScope;
  items: LeaseAmendment[];
  active: boolean;
  rental: boolean;
  currency: string;
  disabled: boolean;
  onLockChange: (locked: boolean) => void;
  onCompleted: () => Promise<void>;
}>) {
  const t = useTranslations("amendments");
  const [creating, setCreating] = useState(false),
    [selection, setSelection] = useState<Selection | null>(null);
  const [fields, setFields] = useState<AmendmentDraftFields>({
    changeType: rental ? "rent_increase" : "clause_modification",
    effectiveDate: "",
    description: "",
    monthlyRent: "",
    endDate: "",
    termsAndConditions: "",
    specialClauses: "",
  });
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    operation: Operation;
    attempt: AmendmentAttempt;
  } | null>(null);
  const [error, setError] = useState<
    "uncertain" | "rejected" | "storageError" | "completedReadError" | null
  >(null);
  const [notice, setNotice] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const inFlight = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const draft = amendmentDraft(fields, scope);
  const open = creating || !!selection;
  const finish = () => {
    setCreating(false);
    setSelection(null);
    setConfirmed(false);
    setPending(null);
    onLockChange(false);
  };
  const choose = (next: Selection | null) => {
    setSelection(next);
    setCreating(!next);
    setConfirmed(false);
    setError(null);
    setNotice(false);
    onLockChange(true);
  };
  const selectedOperation = (): Operation | null => {
    if (pending) return pending.operation;
    if (creating) return draft ? { action: "create", dto: draft } : null;
    if (!selection) return null;
    return {
      action: selection.action,
      id: selection.amendment.id,
      expectedUpdatedAt: selection.amendment.updatedAt,
    };
  };
  const applyOperation = async (
    operation: Operation,
    attempt: AmendmentAttempt,
  ) => {
    if (operation.action === "create")
      await api.create({
        ...operation.dto,
        idempotencyKey: attempt.idempotencyKey,
      });
    else
      await api.transition(operation.id, operation.action, {
        idempotencyKey: attempt.idempotencyKey,
        expectedUpdatedAt: operation.expectedUpdatedAt,
      });
  };
  const refreshCompleted = async () => {
    try {
      await onCompleted();
    } catch {
      if (mounted.current) setError("completedReadError");
    }
  };
  const recoverRejected = async () => {
    // Keep the durable key: a prior uncertain attempt may already have committed.
    setPending(null);
    setError("rejected");
    if (!creating) finish();
    setNeedsRefresh(true);
    try {
      await onCompleted();
      if (mounted.current) setNeedsRefresh(false);
    } catch {
      // A stale decision remains disabled until its source can be read again.
    }
  };
  const reportFailure = async (cause: unknown, sent: boolean) => {
    if (!mounted.current) return;
    if (!sent) {
      setError("storageError");
      return;
    }
    if (
      cause instanceof ApiRequestError &&
      cause.status >= 400 &&
      cause.status < 500
    )
      await recoverRejected();
    else setError("uncertain");
  };
  const send = async () => {
    const operation = selectedOperation();
    if (inFlight.current || disabled || !operation || (!pending && !confirmed))
      return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    let sent = false;
    try {
      const attempt =
        pending?.attempt ?? (await prepareAmendmentAttempt(scope, operation));
      if (!mounted.current) return;
      setPending({ operation, attempt });
      sent = true;
      await applyOperation(operation, attempt);
      if (!mounted.current) return;
      completeAmendmentAttempt(attempt);
      finish();
      setNotice(true);
      if (operation.action === "create")
        setFields({
          changeType: rental ? "rent_increase" : "clause_modification",
          effectiveDate: "",
          description: "",
          monthlyRent: "",
          endDate: "",
          termsAndConditions: "",
          specialClauses: "",
        });
      await refreshCompleted();
    } catch (cause) {
      await reportFailure(cause, sent);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const change = (key: keyof AmendmentDraftFields, value: string) => {
    setFields((previous) => ({ ...previous, [key]: value }));
    setConfirmed(false);
  };
  const selectionLabel =
    selection?.action === "submit" ? "sendForApproval" : selection?.action;
  const legendLabel = creating ? "newDraft" : selectionLabel!;
  let sendLabel = creating ? "saveDraft" : "confirmDecision";
  if (pending) sendLabel = "recover";
  return (
    <section className="space-y-3" aria-label={t("workflow")} aria-busy={busy}>
      {error && <p role="alert">{t(error)}</p>}
      {notice && <output>{t("completed")}</output>}
      {!open && (
        <div className="space-y-3">
          {active && (
            <button
              type="button"
              className={buttonClass}
              disabled={disabled || busy || needsRefresh}
              onClick={() => choose(null)}
            >
              {t("newDraft")}
            </button>
          )}
          {items
            .filter(
              (item) =>
                item.status === "draft" || item.status === "pending_approval",
            )
            .map((item) => (
              <div className="flex flex-wrap items-center gap-2" key={item.id}>
                <span>{t("number", { number: item.amendmentNumber })}</span>
                {item.status === "draft" && active && (
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={disabled || busy || needsRefresh}
                    onClick={() =>
                      choose({ action: "submit", amendment: item })
                    }
                  >
                    {t("sendForApproval")}
                  </button>
                )}
                {item.status === "pending_approval" && (
                  <>
                    {active && (
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={disabled || busy || needsRefresh}
                        onClick={() =>
                          choose({ action: "approve", amendment: item })
                        }
                      >
                        {t("approve")}
                      </button>
                    )}
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={disabled || busy || needsRefresh}
                      onClick={() =>
                        choose({ action: "reject", amendment: item })
                      }
                    >
                      {t("reject")}
                    </button>
                  </>
                )}
              </div>
            ))}
        </div>
      )}
      {open && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <fieldset className="space-y-3 rounded border p-3">
            <legend>{t(legendLabel)}</legend>
            {creating ? (
              <>
                <p>{t("draftDescription")}</p>
                <label className="block">
                  {t("changeType")}
                  <select
                    className={inputClass}
                    value={fields.changeType}
                    disabled={busy || !!pending}
                    onChange={(event) =>
                      change("changeType", event.target.value)
                    }
                  >
                    {types
                      .filter(
                        (type) =>
                          rental ||
                          !["rent_increase", "rent_decrease"].includes(type),
                      )
                      .map((type) => (
                        <option key={type} value={type}>
                          {t(`type.${type}`)}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block">
                  {t("effectiveDate")}
                  <input
                    className={inputClass}
                    type="date"
                    required
                    value={fields.effectiveDate}
                    disabled={busy || !!pending}
                    onChange={(event) =>
                      change("effectiveDate", event.target.value)
                    }
                  />
                </label>
                <label className="block">
                  {t("draftDetails")}
                  <textarea
                    className={inputClass}
                    required
                    maxLength={4000}
                    value={fields.description}
                    disabled={busy || !!pending}
                    onChange={(event) =>
                      change("description", event.target.value)
                    }
                  />
                </label>
                {["rent_increase", "rent_decrease"].includes(
                  fields.changeType,
                ) && (
                  <label className="block">
                    {t("fields.monthlyRent")} ({currency})
                    <input
                      className={inputClass}
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      max="9999999999.99"
                      step="0.01"
                      required
                      value={fields.monthlyRent}
                      disabled={busy || !!pending}
                      onChange={(event) =>
                        change("monthlyRent", event.target.value)
                      }
                    />
                  </label>
                )}
                {fields.changeType === "extension" && (
                  <label className="block">
                    {t("fields.endDate")}
                    <input
                      className={inputClass}
                      type="date"
                      required
                      min={fields.effectiveDate || undefined}
                      value={fields.endDate}
                      disabled={busy || !!pending}
                      onChange={(event) =>
                        change("endDate", event.target.value)
                      }
                    />
                  </label>
                )}
                {fields.changeType === "early_termination" && (
                  <p>{t("terminationDescription")}</p>
                )}
                {fields.changeType === "clause_modification" && (
                  <label className="block">
                    {t("fields.termsAndConditions")}
                    <textarea
                      className={inputClass}
                      maxLength={100000}
                      value={fields.termsAndConditions}
                      disabled={busy || !!pending}
                      onChange={(event) =>
                        change("termsAndConditions", event.target.value)
                      }
                    />
                  </label>
                )}
                {["clause_modification", "guarantor_change", "other"].includes(
                  fields.changeType,
                ) && (
                  <>
                    <p>{t("replacementClauses")}</p>
                    <label className="block">
                      {t("fields.specialClauses")}
                      <textarea
                        className={inputClass}
                        maxLength={100000}
                        required={fields.changeType !== "clause_modification"}
                        value={fields.specialClauses}
                        disabled={busy || !!pending}
                        onChange={(event) =>
                          change("specialClauses", event.target.value)
                        }
                      />
                    </label>
                  </>
                )}
              </>
            ) : (
              <>
                <p>
                  {t("number", {
                    number: selection!.amendment.amendmentNumber,
                  })}
                  : {selection!.amendment.description}
                </p>
                <p>
                  {t("effectiveDate")}:{" "}
                  {selection!.amendment.effectiveDate.slice(0, 10)}
                </p>
                <p>{t(`decision.${selection!.action}`)}</p>
              </>
            )}
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy || !!pending}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              {t("confirm")}
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className={buttonClass}
                disabled={
                  disabled ||
                  busy ||
                  (!pending && (!confirmed || (creating && !draft)))
                }
              >
                {t(sendLabel)}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={busy || !!pending}
                onClick={finish}
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

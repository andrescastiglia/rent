"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { ApiRequestError } from "@/lib/api";
import {
  completeDomainAttempt,
  prepareDomainAttempt,
  type DomainAttempt,
} from "@/lib/domain-operation";
import { formatMoneyByCode } from "@/lib/format-money";
import { Button, Dialog, FormField } from "@/components/ui";

export type CorrectionRequest = { reason: string; amount?: number };
const rejectedStatuses = new Set([400, 403, 404, 409, 422]);

export default function FinancialCorrectionDialog({
  entityId,
  namespace,
  title,
  description,
  currency,
  maximum,
  execute,
  onComplete,
  onClose,
}: Readonly<{
  entityId: string;
  namespace: string;
  title: string;
  description: string;
  currency: string;
  maximum?: number;
  execute: (request: CorrectionRequest, key: string) => Promise<unknown>;
  onComplete: () => void;
  onClose: () => void;
}>) {
  const { user } = useAuth();
  const t = useTranslations("financialCorrection");
  const locale = useLocale();
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<{
    request: CorrectionRequest;
    attempt: DomainAttempt;
  }>();
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const valid =
    reason.trim().length >= 3 &&
    (maximum === undefined ||
      (Number(amount) > 0 && Number(amount) <= maximum));
  const save = async () => {
    if (inFlight.current || !user?.id || !user.companyId || !valid) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    let attempted: DomainAttempt | undefined;
    let sent = false;
    try {
      const request: CorrectionRequest = {
        reason: reason.trim(),
        ...(maximum === undefined ? {} : { amount: Number(amount) }),
      };
      const operation = pending ?? {
        request,
        attempt: await prepareDomainAttempt(
          namespace,
          { companyId: user.companyId, userId: user.id, entityId },
          request,
        ),
      };
      attempted = operation.attempt;
      setPending(operation);
      sent = true;
      await execute(operation.request, operation.attempt.idempotencyKey);
      completeDomainAttempt(operation.attempt);
      if (!mounted.current) return;
      setPending(undefined);
      onComplete();
    } catch (error_) {
      const rejected =
        !pending &&
        !attempted?.recovered &&
        error_ instanceof ApiRequestError &&
        rejectedStatuses.has(error_.status);
      if (rejected && attempted) {
        completeDomainAttempt(attempted);
        setPending(undefined);
      }
      let message = "uncertain";
      if (!sent) message = "storageError";
      else if (rejected) message = "rejected";
      if (mounted.current) setError(message);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  let submitLabel = t("review");
  if (reviewing) submitLabel = t("confirm");
  if (pending) submitLabel = t("recover");
  return (
    <Dialog
      open
      onClose={() => {
        if (!busy) {
          mounted.current = false;
          onClose();
        }
      }}
      title={title}
      description={description}
      busy={busy}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          if (!reviewing) setReviewing(true);
          else void save();
        }}
      >
        {maximum !== undefined && (
          <FormField
            id="correction-amount"
            label={t("amount")}
            help={t("maximum", {
              amount: formatMoneyByCode(maximum, currency, locale),
            })}
          >
            {(attributes) => (
              <input
                {...attributes}
                className="ui-field"
                type="number"
                min="0.01"
                max={maximum}
                step="0.01"
                required
                disabled={busy || Boolean(pending)}
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setReviewing(false);
                }}
              />
            )}
          </FormField>
        )}
        <FormField
          id="correction-reason"
          label={t("reason")}
          help={t("reasonHelp")}
        >
          {(attributes) => (
            <textarea
              {...attributes}
              className="ui-field"
              minLength={3}
              required
              disabled={busy || Boolean(pending)}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setReviewing(false);
              }}
            />
          )}
        </FormField>
        {reviewing && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <p className="font-semibold">{t("review")}</p>
            {maximum !== undefined && (
              <p className="mt-2 font-semibold tabular-nums">
                {formatMoneyByCode(Number(amount), currency, locale)}
              </p>
            )}
            <p className="mt-2 break-words">{reason}</p>
            <p className="mt-2">{t("impact")}</p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {t(error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {t("close")}
          </Button>
          <Button
            variant={reviewing ? "danger" : "primary"}
            type="submit"
            disabled={!valid || !user?.companyId}
            busy={busy}
          >
            {submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

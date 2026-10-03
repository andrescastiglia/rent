"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { dashboardApi, type PersonActivityItem } from "@/lib/api/dashboard";
import {
  reviewExpired,
  type PendingActionReview,
} from "@/lib/pending-action-review";
import {
  Button,
  Dialog,
  FormField,
  StatePanel,
  Surface,
} from "@/components/ui";

function ReviewValues({
  values,
}: Readonly<{ values: Record<string, unknown> }>) {
  const t = useTranslations("actionReview");
  const describe = (value: unknown): string => {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return t(value ? "yes" : "no");
    if (typeof value === "object")
      return Object.entries(value)
        .map(
          ([key, item]) =>
            `${key}: ${/password|secret|token/i.test(key) ? t("protected") : describe(item)}`,
        )
        .join(" · ");
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "bigint")
      return value.toString();
    return t("protected");
  };
  return (
    <dl className="space-y-3">
      {Object.entries(values).map(([key, value]) => (
        <div key={key} className="min-w-0">
          <dt className="text-xs font-medium text-muted">
            {key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ")}
          </dt>
          <dd className="mt-1 break-words text-sm">
            {/password|secret|token/i.test(key)
              ? t("protected")
              : describe(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function PendingActionReviewDialog({
  item,
  password,
  error,
  busy,
  onPasswordChange,
  onCancel,
  onConfirm,
}: Readonly<{
  item: Pick<PersonActivityItem, "actionId" | "subject" | "canRetry"> | null;
  password: string;
  error: string | null;
  busy: boolean;
  onPasswordChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  const t = useTranslations("actionReview");
  const td = useTranslations("dashboard");
  const locale = useLocale();
  const [review, setReview] = useState<PendingActionReview>();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [expired, setExpired] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!item?.actionId) return;
    let cancelled = false;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setFailed(false);
    setReview(undefined);
    setExpired(false);
    dashboardApi
      .getPendingActionReview(item.actionId)
      .then((detail) => {
        if (cancelled) return;
        setReview(detail);
        setExpired(reviewExpired(detail));
        const remaining = new Date(detail.expiresAt).getTime() - Date.now();
        if (remaining > 0)
          expiryTimer = setTimeout(
            () => setExpired(true),
            Math.min(remaining, 2147483647),
          );
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(expiryTimer);
    };
  }, [item?.actionId, revision]);
  if (!item) return null;
  const canConfirm = Boolean(
    review && !expired && !loading && !failed && password && !busy,
  );
  let panelContent1;
  if (loading) {
    panelContent1 = <StatePanel busy title={t("loading")} />;
  } else if (failed) {
    panelContent1 = (
      <StatePanel
        error
        title={t("unavailable")}
        action={
          <Button
            variant="secondary"
            onClick={() => setRevision((value) => value + 1)}
          >
            {t("retry")}
          </Button>
        }
      />
    );
  } else {
    panelContent1 = review && (
      <div className="space-y-4">
        <h3 className="font-semibold">{review.entityLabel}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Surface className="p-4">
            <h4 className="mb-3 text-sm font-semibold">{t("current")}</h4>
            <ReviewValues values={review.currentState} />
          </Surface>
          <Surface className="p-4">
            <h4 className="mb-3 text-sm font-semibold">{t("proposed")}</h4>
            <ReviewValues values={review.proposedChange} />
          </Surface>
        </div>
        {review.amount !== undefined && (
          <p className="text-lg font-semibold tabular-nums">
            {t("amount")}: {review.currency} {review.amount}
          </p>
        )}
        <div>
          <h4 className="text-sm font-semibold">{t("impact")}</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {review.impact.map((impact) => (
              <li key={impact}>{impact}</li>
            ))}
          </ul>
        </div>
        <p className="break-all text-xs text-muted">
          {t("version")}: {review.observedVersion}
        </p>
        <p className="text-xs text-muted">
          {t("expires")}: {new Date(review.expiresAt).toLocaleString(locale)}
        </p>
        {expired && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {t("expired")}
          </p>
        )}
      </div>
    );
  }
  return (
    <Dialog
      open
      onClose={onCancel}
      title={td("peopleActivity.reauthTitle")}
      description={item.subject}
      busy={busy}
    >
      {panelContent1}
      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (canConfirm) onConfirm();
        }}
      >
        <FormField
          id="review-password"
          label={td("peopleActivity.reauthPassword")}
          error={error ?? undefined}
        >
          {(attributes) => (
            <input
              {...attributes}
              type="password"
              className="ui-field"
              autoComplete="current-password"
              required
              disabled={busy || !review || expired}
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
            />
          )}
        </FormField>
        {item.canRetry && (
          <p className="text-sm text-muted">
            {td("peopleActivity.retryPrompt")}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            {td("peopleActivity.actions.cancel")}
          </Button>
          <Button type="submit" busy={busy} disabled={!canConfirm}>
            {td(
              item.canRetry
                ? "peopleActivity.actions.retry"
                : "peopleActivity.actions.approve",
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

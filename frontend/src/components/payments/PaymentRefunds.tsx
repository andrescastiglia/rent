"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { isInternalUser } from "@/lib/permissions";
import { paymentsApi, type PaymentRefund } from "@/lib/api/payments";
import { formatMoneyByCode } from "@/lib/format-money";
import type { Payment } from "@/types/payment";
import { Button, StatePanel, Surface } from "@/components/ui";
import FinancialCorrectionDialog from "./FinancialCorrectionDialog";

export default function PaymentRefunds({
  payment,
  onChanged,
}: Readonly<{ payment: Payment; onChanged: () => void }>) {
  const { user } = useAuth();
  const t = useTranslations("financialCorrection");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [refunds, setRefunds] = useState<PaymentRefund[]>([]);
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);
  const [revision, setRevision] = useState(0);
  const [downloading, setDownloading] = useState<string>();
  const remaining = Math.max(
    0,
    Number(payment.amount) - Number(payment.refundedAmount ?? 0),
  );
  useEffect(() => {
    let cancelled = false;
    setError(false);
    paymentsApi
      .listRefunds(payment.id)
      .then((items) => {
        if (!cancelled) setRefunds(items);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [payment.id, revision]);
  const download = async (refund: PaymentRefund) => {
    setDownloading(refund.id);
    try {
      await paymentsApi.downloadRefund(payment.id, refund);
    } catch {
      setError(true);
    } finally {
      setDownloading(undefined);
    }
  };
  return (
    <Surface className="space-y-4 p-5">
      <h2 className="text-lg font-semibold">{t("refund")}</h2>
      <p className="text-sm text-muted">
        {t("maximum", {
          amount: formatMoneyByCode(remaining, payment.currencyCode, locale),
        })}
      </p>
      {isInternalUser(user) &&
        payment.status === "completed" &&
        remaining > 0 && (
          <Button variant="danger" onClick={() => setOpen(true)}>
            {t("refund")}
          </Button>
        )}
      {success && (
        <output className="block text-sm text-emerald-700 dark:text-emerald-300">
          {t("success")}
        </output>
      )}
      {error && (
        <StatePanel
          error
          title={tc("error")}
          action={
            <Button
              variant="secondary"
              onClick={() => setRevision((value) => value + 1)}
            >
              {tc("retry")}
            </Button>
          }
        />
      )}
      {refunds.map((refund) => (
        <div
          key={refund.id}
          className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"
        >
          <div>
            <p className="font-semibold tabular-nums">
              {refund.document_number} ·{" "}
              {formatMoneyByCode(
                Number(refund.amount),
                refund.currency,
                locale,
              )}
            </p>
            <p className="mt-1 text-sm text-muted">{refund.reason}</p>
          </div>
          <Button
            variant="secondary"
            disabled={Boolean(downloading)}
            busy={downloading === refund.id}
            onClick={() => void download(refund)}
          >
            {tc("download")}
          </Button>
        </div>
      ))}
      {open && (
        <FinancialCorrectionDialog
          entityId={payment.id}
          namespace="payment-refund"
          title={t("refund")}
          description={
            payment.receipt?.receiptNumber ?? payment.reference ?? payment.id
          }
          currency={payment.currencyCode}
          maximum={remaining}
          execute={(request, key) =>
            paymentsApi.refund(
              payment.id,
              { amount: request.amount!, reason: request.reason },
              key,
            )
          }
          onClose={() => setOpen(false)}
          onComplete={() => {
            setOpen(false);
            setSuccess(true);
            setRevision((value) => value + 1);
            onChanged();
          }}
        />
      )}
    </Surface>
  );
}

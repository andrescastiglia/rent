"use client";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { SettlementCalculationDto } from "@/lib/api/settlement-generations";
export function SettlementCalculationDetails({
  calculation,
}: Readonly<{ calculation: SettlementCalculationDto }>) {
  const t = useTranslations("settlementGeneration");
  const locale = useLocale();
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <dt>{t("gross")}</dt>
          <dd>
            {calculation.grossAmount} {calculation.currency}
          </dd>
        </div>
        <div>
          <dt>{t("commission", { rate: calculation.commissionRate })}</dt>
          <dd>
            {calculation.commissionAmount} {calculation.currency}
          </dd>
        </div>
        <div>
          <dt>{t("beforeWithholdings")}</dt>
          <dd>
            {calculation.netBeforeWithholdings} {calculation.currency}
          </dd>
        </div>
        <div>
          <dt>{t("scheduled")}</dt>
          <dd>{calculation.scheduledDate ?? t("noDate")}</dd>
        </div>
      </dl>
      <details>
        <summary className="cursor-pointer underline">
          {t("invoices", { count: calculation.invoices.length })}
        </summary>
        <ul className="mt-3 space-y-3">
          {calculation.invoices.map((invoice) => (
            <li key={invoice.id} className="rounded border p-3 break-words">
              <Link
                className="underline"
                href={`/${locale}/invoices/${encodeURIComponent(invoice.id)}`}
              >
                {invoice.invoiceNumber}
              </Link>
              <p>
                {t("collected")}: {invoice.collectedAmount}{" "}
                {calculation.currency}
              </p>
              <p>
                {t("credits")}: {invoice.creditedAmount} {calculation.currency}
              </p>
              <p>
                {t("included")}: {invoice.grossAmount} {calculation.currency}
              </p>
              <p>
                {t("scheduled")}: {invoice.scheduledDate}
              </p>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

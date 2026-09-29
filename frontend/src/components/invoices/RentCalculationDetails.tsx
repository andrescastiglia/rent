"use client";
import { useLocale, useTranslations } from "next-intl";
import { RentCalculation } from "@/types/payment";
import { formatInvoiceDate } from "@/lib/invoice-date";
import { formatMoneyByCode } from "@/lib/format-money";

export function RentCalculationDetails({
  calculation,
}: Readonly<{ calculation?: RentCalculation | null }>) {
  const t = useTranslations("rentCalculation"),
    locale = useLocale();
  if (!calculation || calculation.version !== 1) return null;
  return (
    <section
      className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6"
      aria-labelledby="rent-calculation-title"
    >
      <h2
        id="rent-calculation-title"
        className="text-lg font-semibold text-gray-900 dark:text-white mb-4"
      >
        {t("title")}
      </h2>
      <p>
        {t("rent")}:{" "}
        {formatMoneyByCode(Number(calculation.finalRent), calculation.currency)}
      </p>
      {calculation.adjustments.length === 0 ? (
        <p>{t("unchanged")}</p>
      ) : (
        <ol className="space-y-4 mt-4">
          {calculation.adjustments.map((step) => (
            <li
              key={step.effectiveDate}
              className="border-t border-gray-200 dark:border-gray-700 pt-3"
            >
              <h3 className="font-medium">
                {t("effective")}:{" "}
                {formatInvoiceDate(step.effectiveDate, locale)}
              </h3>
              <p>
                {formatMoneyByCode(
                  Number(step.previousRent),
                  calculation.currency,
                )}{" "}
                →{" "}
                {formatMoneyByCode(Number(step.newRent), calculation.currency)}
              </p>
              <p>
                {t("base")}: {formatInvoiceDate(step.baseDate, locale)} ·{" "}
                {(step.index === "igp_m"
                  ? "IGP-M"
                  : step.index?.toUpperCase()) ?? t(step.type)}
              </p>
              {step.lagMonths !== null && (
                <p>
                  {t("lag")}: {step.lagMonths}
                </p>
              )}
              {step.observations.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer font-medium">
                    {t("evidence")}
                  </summary>
                  <ul className="space-y-2 mt-2">
                    {step.observations.map((row) => (
                      <li key={row.id}>
                        {formatInvoiceDate(row.date, locale)}: {row.value}
                        {row.value_kind === "monthly_percent" ? "%" : ""}
                        <span className="block text-sm">
                          {row.source} · {row.source_series} · {t("revision")}{" "}
                          {row.revision}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

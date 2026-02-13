"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Invoice } from "@/types/payment";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { formatMoneyByCode } from "@/lib/format-money";
import { invoicesApi } from "@/lib/api/payments";
import { useLocale, useTranslations } from "next-intl";
import { Calendar, FileText, AlertCircle, Download, Eye } from "lucide-react";

interface InvoiceCardProps {
  readonly invoice: Invoice;
}

export function InvoiceCard({ invoice }: InvoiceCardProps) {
  const t = useTranslations("invoices");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [downloading, setDownloading] = useState(false);

  const formattedTotal = formatMoneyByCode(invoice.total, invoice.currencyCode);
  const formattedPaid = formatMoneyByCode(
    invoice.amountPaid,
    invoice.currencyCode,
  );
  const formattedDue = new Date(invoice.dueDate).toLocaleDateString(locale);
  const periodStart = new Date(invoice.periodStart).toLocaleDateString(locale);
  const periodEnd = new Date(invoice.periodEnd).toLocaleDateString(locale);

  const isPending =
    invoice.status === "pending" ||
    invoice.status === "sent" ||
    invoice.status === "partial";
  const isOverdue = invoice.status === "overdue";

  const handleDownloadInvoice = async () => {
    try {
      setDownloading(true);
      await invoicesApi.downloadPdf(invoice.id, invoice.invoiceNumber);
    } catch (error) {
      console.error("Failed to download invoice from list", error);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden border ${isOverdue ? "border-orange-300 dark:border-orange-600" : "border-gray-200 dark:border-gray-700"}`}
    >
      <div className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {invoice.invoiceNumber}
            </p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {formattedTotal}
            </p>
          </div>
          <InvoiceStatusBadge status={invoice.status} />
        </div>

        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center">
            <Calendar size={16} className="mr-2" />
            <span>
              {t("period")}: {periodStart} - {periodEnd}
            </span>
          </div>
          <div className="flex items-center">
            <FileText size={16} className="mr-2" />
            <span>
              {t("dueDate")}: {formattedDue}
            </span>
          </div>

          {isPending && (
            <div className="flex items-center text-blue-600 dark:text-blue-400">
              <AlertCircle size={16} className="mr-2" />
              <span>
                {t("paid")}: {formattedPaid}
              </span>
            </div>
          )}

          {invoice.lateFee > 0 && (
            <div className="flex items-center text-orange-600 dark:text-orange-400">
              <AlertCircle size={16} className="mr-2" />
              <span>
                {t("lateFee")}:{" "}
                {formatMoneyByCode(invoice.lateFee, invoice.currencyCode)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/${locale}/invoices/${invoice.id}`}
            className="btn btn-secondary btn-sm"
          >
            <Eye size={14} />
            {tCommon("view")}
          </Link>
          {invoice.pdfUrl && (
            <button
              type="button"
              onClick={() => {
                handleDownloadInvoice().catch((error) => {
                  console.error("Failed to download invoice from list", error);
                });
              }}
              disabled={downloading}
              className="btn btn-primary btn-sm"
            >
              <Download size={14} />
              {downloading ? tCommon("loading") : t("actions.downloadInvoice")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Invoice } from "@/types/payment";
import { invoicesApi } from "@/lib/api/payments";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { formatMoneyByCode } from "@/lib/format-money";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Loader2, Calendar, Download } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

export default function InvoiceDetailPage() {
  const { loading: authLoading } = useAuth();
  const params = useParams();
  const invoiceId = Array.isArray(params.id) ? params.id[0] : params.id;
  const t = useTranslations("invoices");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const loadInvoice = useCallback(async () => {
    try {
      if (!invoiceId) return;
      const data = await invoicesApi.getById(invoiceId);
      setInvoice(data);
    } catch (error) {
      console.error("Failed to load invoice", error);
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    if (authLoading) return;
    loadInvoice();
  }, [loadInvoice, authLoading]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-gray-500 dark:text-gray-400">{t("notFound")}</p>
        <Link
          href={`/${locale}/invoices`}
          className="text-blue-600 hover:underline"
        >
          {t("backToInvoices")}
        </Link>
      </div>
    );
  }

  const formattedTotal = formatMoneyByCode(invoice.total, invoice.currencyCode);
  const formattedSubtotal = formatMoneyByCode(
    invoice.subtotal,
    invoice.currencyCode,
  );
  const formattedLateFee = formatMoneyByCode(
    invoice.lateFee,
    invoice.currencyCode,
  );
  const formattedPaid = formatMoneyByCode(
    invoice.amountPaid,
    invoice.currencyCode,
  );
  const formattedPending = formatMoneyByCode(
    invoice.total - invoice.amountPaid,
    invoice.currencyCode,
  );

  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true);
      await invoicesApi.downloadPdf(invoice.id, invoice.invoiceNumber);
    } catch (error) {
      console.error("Failed to download invoice PDF from detail", error);
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`/${locale}/invoices`}
          className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
        >
          <ArrowLeft size={16} className="mr-1" />
          {t("backToInvoices")}
        </Link>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {t("invoiceDetails")}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 font-mono">
              {invoice.invoiceNumber}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <InvoiceStatusBadge status={invoice.status} />
            {invoice.pdfUrl && (
              <button
                type="button"
                onClick={() => void handleDownloadPdf()}
                disabled={downloadingPdf}
                className="btn btn-success"
              >
                <Download size={18} className="mr-2" />
                {downloadingPdf ? tCommon("loading") : t("downloadPdf")}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Invoice Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Period Info */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t("periodInfo")}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t("periodStart")}
                </p>
                <p className="text-gray-900 dark:text-white font-medium">
                  {new Date(invoice.periodStart).toLocaleDateString(locale)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t("periodEnd")}
                </p>
                <p className="text-gray-900 dark:text-white font-medium">
                  {new Date(invoice.periodEnd).toLocaleDateString(locale)}
                </p>
              </div>
            </div>
          </div>

          {/* Amounts Breakdown */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t("breakdown")}
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">
                  {t("subtotal")}
                </span>
                <span className="text-gray-900 dark:text-white">
                  {formattedSubtotal}
                </span>
              </div>
              {invoice.lateFee > 0 && (
                <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-orange-600 dark:text-orange-400">
                    {t("lateFee")}
                  </span>
                  <span className="text-orange-600 dark:text-orange-400">
                    {formattedLateFee}
                  </span>
                </div>
              )}
              {invoice.adjustments !== 0 && (
                <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">
                    {t("adjustments")}
                  </span>
                  <span className="text-gray-900 dark:text-white">
                    {formatMoneyByCode(
                      invoice.adjustments,
                      invoice.currencyCode,
                    )}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-2 text-lg font-bold">
                <span className="text-gray-900 dark:text-white">
                  {t("total")}
                </span>
                <span className="text-gray-900 dark:text-white">
                  {formattedTotal}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Status */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t("paymentStatus")}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t("amountPaid")}
                </p>
                <p className="text-green-600 dark:text-green-400 font-bold text-xl">
                  {formattedPaid}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t("amountPending")}
                </p>
                <p
                  className={`font-bold text-xl ${invoice.total - invoice.amountPaid > 0 ? "text-red-600 dark:text-red-400" : "text-gray-500"}`}
                >
                  {formattedPending}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Due Date */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <div className="flex items-center mb-2">
              <Calendar size={20} className="text-gray-400 mr-2" />
              <h3 className="font-medium text-gray-900 dark:text-white">
                {t("dueDate")}
              </h3>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {new Date(invoice.dueDate).toLocaleDateString(locale)}
            </p>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                {t("notes")}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {invoice.notes}
              </p>
            </div>
          )}

          {/* Actions */}
          {(invoice.status === "pending" ||
            invoice.status === "sent" ||
            invoice.status === "partial") && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <Link
                href={`/${locale}/payments/new?leaseId=${invoice.leaseId}`}
                className="btn btn-primary w-full"
              >
                {t("registerPayment")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

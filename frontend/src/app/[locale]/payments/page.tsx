"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Payment, PaymentFilters, PaymentStatus } from "@/types/payment";
import { paymentsApi } from "@/lib/api/payments";
import { ownersApi } from "@/lib/api/owners";
import { OwnerSettlementSummary } from "@/types/owner";
import { Search, Loader2, Filter, Download, Eye } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import Link from "next/link";
import { formatMoneyByCode } from "@/lib/format-money";

type PaymentTimelineItem =
  | { kind: "tenant"; date: string; payment: Payment }
  | { kind: "owner"; date: string; payment: OwnerSettlementSummary };

export default function PaymentsPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations("payments");
  const locale = useLocale();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [ownerPayments, setOwnerPayments] = useState<OwnerSettlementSummary[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      const filters: PaymentFilters = {};
      if (statusFilter) {
        filters.status = statusFilter as PaymentStatus;
      }
      const [tenantResult, ownerResult] = await Promise.all([
        paymentsApi.getAll(filters),
        ownersApi.listSettlementPayments(200),
      ]);
      setPayments(tenantResult.data);
      setOwnerPayments(ownerResult);
    } catch (error) {
      console.error("Failed to load payments", error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (authLoading) return;
    loadPayments().catch((error) => {
      console.error("Failed to load payments", error);
    });
  }, [loadPayments, authLoading]);

  const timeline: PaymentTimelineItem[] = [
    ...payments.map((payment) => ({
      kind: "tenant" as const,
      date: payment.paymentDate,
      payment,
    })),
    ...ownerPayments.map((payment) => ({
      kind: "owner" as const,
      date: payment.processedAt ?? payment.updatedAt,
      payment,
    })),
  ]
    .filter((item) => {
      const term = searchTerm.trim().toLowerCase();
      if (!term) return true;
      if (item.kind === "tenant") {
        return (
          item.payment.reference?.toLowerCase().includes(term) ||
          item.payment.receipt?.receiptNumber?.toLowerCase().includes(term)
        );
      }
      return (
        item.payment.ownerName.toLowerCase().includes(term) ||
        item.payment.period.toLowerCase().includes(term) ||
        item.payment.transferReference?.toLowerCase().includes(term)
      );
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const renderTimelineItem = (item: PaymentTimelineItem) => {
    if (item.kind === "tenant") {
      return (
        <div
          key={`tenant-${item.payment.id}`}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {t("tenantPaymentEntry")}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {new Date(item.payment.paymentDate).toLocaleDateString(locale)}
              </p>
              {item.payment.reference ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {item.payment.reference}
                </p>
              ) : null}
            </div>
            <p className="text-lg font-bold text-green-700 dark:text-green-400">
              +{" "}
              {formatMoneyByCode(
                item.payment.amount,
                item.payment.currencyCode,
                locale,
              )}
            </p>
          </div>
          <div className="mt-2 flex gap-2">
            <Link
              href={`/${locale}/payments/${item.payment.id}`}
              className="btn btn-secondary btn-sm"
            >
              <Eye size={14} />
              {t("viewPayment")}
            </Link>
            {item.payment.receipt ? (
              <button
                type="button"
                onClick={() => {
                  paymentsApi
                    .downloadReceiptPdf(
                      item.payment.id,
                      item.payment.receipt?.receiptNumber,
                    )
                    .catch((error) => {
                      console.error("Failed to download receipt", error);
                    });
                }}
                className="btn btn-success btn-sm"
              >
                <Download size={14} />
                {t("actions.downloadReceipt")}
              </button>
            ) : null}
          </div>
        </div>
      );
    }

    return (
      <div
        key={`owner-${item.payment.id}`}
        className="rounded-lg border border-red-200 dark:border-red-900 bg-white dark:bg-gray-800 p-4"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {t("ownerPaymentEntry")}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {item.payment.ownerName} · {item.payment.period}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {(item.payment.processedAt ?? item.payment.updatedAt) &&
                new Date(
                  item.payment.processedAt ?? item.payment.updatedAt,
                ).toLocaleDateString(locale)}
            </p>
          </div>
          <p className="text-lg font-bold text-red-700 dark:text-red-400">
            -{" "}
            {formatMoneyByCode(
              item.payment.netAmount,
              item.payment.currencyCode,
              locale,
            )}
          </p>
        </div>
        <div className="mt-2 flex gap-2">
          {item.payment.receiptPdfUrl ? (
            <button
              type="button"
              onClick={() => {
                ownersApi
                  .downloadSettlementReceipt(
                    item.payment.id,
                    item.payment.receiptName ?? undefined,
                  )
                  .catch((error) => {
                    console.error(
                      "Failed to download owner settlement receipt",
                      error,
                    );
                  });
              }}
              className="btn btn-secondary btn-sm"
            >
              <Download size={14} />
              {t("downloadOwnerReceipt")}
            </button>
          ) : (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t("ownerReceiptPending")}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t("title")}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {t("subtitle")}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder={t("searchPlaceholder")}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block w-full pl-10 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="">{t("allStatuses")}</option>
            <option value="pending">{t("status.pending")}</option>
            <option value="processing">{t("status.processing")}</option>
            <option value="completed">{t("status.completed")}</option>
            <option value="failed">{t("status.failed")}</option>
            <option value="refunded">{t("status.refunded")}</option>
            <option value="cancelled">{t("status.cancelled")}</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
        </div>
      ) : timeline.length > 0 ? (
        <div className="space-y-3">{timeline.map(renderTimelineItem)}</div>
      ) : (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            {t("noPayments")}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("noPaymentsDescription")}
          </p>
        </div>
      )}
    </div>
  );
}

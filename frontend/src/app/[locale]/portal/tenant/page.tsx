"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { tenantsApi } from "@/lib/api/tenants";
import { paymentsApi } from "@/lib/api/payments";
import { TenantSummary } from "@/types/tenant";
import { Payment } from "@/types/payment";
import {
  FileText,
  CreditCard,
  Wrench,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";

export default function TenantPortalDashboard() {
  const { user } = useAuth();
  const t = useTranslations("tenantPortal");
  const locale = useLocale();
  const [summary, setSummary] = useState<TenantSummary | null>(null);
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [summaryData, paymentsData] = await Promise.all([
          tenantsApi.getMySummary(),
          paymentsApi.getAll({ limit: 3 }),
        ]);
        setSummary(summaryData);
        setRecentPayments(paymentsData.data.slice(0, 3));
      } catch {
        // fail silently, show empty state
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const leaseStatusIcon = (status?: string) => {
    switch (status) {
      case "ACTIVE":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "FINALIZED":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-yellow-500" />;
    }
  };

  const LOCALE_CODES: Record<string, string> = {
    en: "en-US",
    pt: "pt-BR",
  };
  const localeCode = LOCALE_CODES[locale] ?? "es-AR";

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString(localeCode);
  };

  const formatCurrency = (amount: number, currency = "ARS") => {
    return new Intl.NumberFormat(localeCode, {
      style: "currency",
      currency,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome card */}
      <div className="bg-blue-600 dark:bg-blue-700 rounded-xl p-5 text-white">
        <p className="text-blue-100 text-sm">{t("welcome")}</p>
        <h1 className="text-2xl font-bold mt-1">
          {user?.firstName} {user?.lastName}
        </h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4">
        {/* Contract status */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {t("contractStatus")}
              </p>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                {summary?.activeLease
                  ? t(
                      `leaseStatus.${summary.activeLease.status}` as Parameters<
                        typeof t
                      >[0],
                    )
                  : t("noActiveContract")}
              </p>
            </div>
            {leaseStatusIcon(summary?.activeLease?.status)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Next payment */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {t("nextPayment")}
            </p>
            <p className="mt-1 text-base font-semibold text-gray-900 dark:text-white">
              {formatDate(summary?.nextPaymentDue)}
            </p>
          </div>

          {/* Pending balance */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {t("pendingBalance")}
            </p>
            <p className="mt-1 text-base font-semibold text-gray-900 dark:text-white">
              {formatCurrency(summary?.accountBalance ?? 0)}
            </p>
            {(summary?.pendingInvoicesCount ?? 0) > 0 && (
              <p className="text-xs text-orange-500 mt-0.5">
                {summary?.pendingInvoicesCount} pendiente
                {(summary?.pendingInvoicesCount ?? 0) > 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Recent payments */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            {t("recentPayments")}
          </h2>
          <Link
            href={`/${locale}/portal/tenant/payments`}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Ver todos
          </Link>
        </div>
        <div className="divide-y divide-gray-50 dark:divide-gray-700">
          {recentPayments.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center text-gray-400">
              {t("noPayments")}
            </p>
          ) : (
            recentPayments.map((payment) => (
              <div
                key={payment.id}
                className="px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {formatCurrency(payment.amount, payment.currencyCode)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(payment.paymentDate)}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    payment.status === "completed"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                  }`}
                >
                  {payment.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          {t("quickActions")}
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <Link
            href={`/${locale}/portal/tenant/contract`}
            className="flex flex-col items-center gap-2 bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
          >
            <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <span className="text-xs text-center text-gray-700 dark:text-gray-300 leading-tight">
              {t("viewContract")}
            </span>
          </Link>
          <Link
            href={`/${locale}/portal/tenant/payments`}
            className="flex flex-col items-center gap-2 bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
          >
            <CreditCard className="h-6 w-6 text-green-600 dark:text-green-400" />
            <span className="text-xs text-center text-gray-700 dark:text-gray-300 leading-tight">
              {t("pay")}
            </span>
          </Link>
          <Link
            href={`/${locale}/portal/tenant/maintenance`}
            className="flex flex-col items-center gap-2 bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
          >
            <Wrench className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            <span className="text-xs text-center text-gray-700 dark:text-gray-300 leading-tight">
              {t("requestMaintenance")}
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

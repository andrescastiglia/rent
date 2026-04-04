"use client";

import React, { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { leasesApi } from "@/lib/api/leases";
import { tenantsApi } from "@/lib/api/tenants";
import { Lease } from "@/types/lease";
import { TenantSummary } from "@/types/tenant";
import {
  Download,
  Loader2,
  MapPin,
  Calendar,
  DollarSign,
  RefreshCw,
} from "lucide-react";

export default function TenantContractPage() {
  const t = useTranslations("tenantPortal");
  const locale = useLocale();
  const [lease, setLease] = useState<Lease | null>(null);
  const [summary, setSummary] = useState<TenantSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [leasesData, summaryData] = await Promise.all([
          leasesApi.getAll({ status: "ACTIVE" }),
          tenantsApi.getMySummary(),
        ]);
        const activeLease =
          leasesData.find((l) => l.status === "ACTIVE") ??
          leasesData[0] ??
          null;
        setLease(activeLease);
        setSummary(summaryData);
      } catch {
        // fail silently
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString(
      locale === "en" ? "en-US" : locale === "pt" ? "pt-BR" : "es-AR",
    );
  };

  const formatCurrency = (amount?: number | null, currency = "ARS") => {
    if (amount == null) return "—";
    return new Intl.NumberFormat(
      locale === "en" ? "en-US" : locale === "pt" ? "pt-BR" : "es-AR",
      { style: "currency", currency },
    ).format(amount);
  };

  const getStatusBadgeClass = (status: Lease["status"]) => {
    switch (status) {
      case "ACTIVE":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "FINALIZED":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      default:
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (!lease) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          {t("noActiveContract")}
        </p>
      </div>
    );
  }

  const address = lease.property?.address;
  const addressStr = address
    ? `${address.street} ${address.number}${address.unit ? ` ${address.unit}` : ""}, ${address.city}`
    : "—";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">
        {t("myContract")}
      </h1>

      {/* Status badge */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {t("contractStatus")}
          </h2>
          <span
            className={`text-sm px-3 py-1 rounded-full font-medium ${getStatusBadgeClass(lease.status)}`}
          >
            {t(`leaseStatus.${lease.status}` as Parameters<typeof t>[0])}
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("propertyAddress")}
              </p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {addressStr}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Calendar className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("contractDates")}
              </p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {formatDate(lease.startDate)} – {formatDate(lease.endDate)}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <DollarSign className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("monthlyRent")}
              </p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {formatCurrency(lease.rentAmount, lease.currency)}
              </p>
            </div>
          </div>

          {lease.billingFrequency && (
            <div className="flex items-start gap-3">
              <RefreshCw className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("billingFrequency")}
                </p>
                <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                  {lease.billingFrequency.replace(/_/g, " ")}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Account balance */}
      {summary && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {t("pendingBalance")}
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {formatCurrency(summary.accountBalance)}
          </p>
        </div>
      )}

      {/* Download PDF button */}
      <button
        type="button"
        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
        onClick={() => {
          if (lease.id) {
            window.open(`/api/leases/${lease.id}/pdf`, "_blank");
          }
        }}
      >
        <Download className="h-4 w-4" />
        {t("downloadPdf")}
      </button>
    </div>
  );
}

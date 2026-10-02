"use client";

import React, { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { leasesApi } from "@/lib/api/leases";
import { tenantsApi } from "@/lib/api/tenants";
import { useAuth } from "@/contexts/auth-context";
import { ContractDocument } from "@/components/leases/ContractDocument";
import { Button, StatePanel } from "@/components/ui";
import { formatCalendarDate } from "@/lib/calendar-date";
import { Lease } from "@/types/lease";
import { TenantSummary } from "@/types/tenant";
import { Loader2, MapPin, Calendar, DollarSign, RefreshCw } from "lucide-react";

function getLocaleCode(loc: string): string {
  if (loc === "en") return "en-US";
  if (loc === "pt") return "pt-BR";
  return "es-AR";
}

export default function TenantContractPage() {
  const t = useTranslations("tenantPortal");
  const { user } = useAuth();
  const locale = useLocale();
  const [lease, setLease] = useState<Lease | null>(null);
  const [summary, setSummary] = useState<TenantSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(false);
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
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [revision]);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    return formatCalendarDate(dateStr, getLocaleCode(locale));
  };

  const formatCurrency = (amount?: number | null, currency = "ARS") => {
    if (amount == null) return "—";
    return new Intl.NumberFormat(getLocaleCode(locale), {
      style: "currency",
      currency,
    }).format(amount);
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

  if (error)
    return (
      <StatePanel
        error
        title={t("readError")}
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
  const unitStr = address?.unit ? ` ${address.unit}` : "";
  const addressStr = address
    ? `${address.street} ${address.number}${unitStr}, ${address.city}`
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
                  {lease.billingFrequency.replaceAll("_", " ")}
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

      {user?.companyId && (
        <ContractDocument
          leaseId={lease.id}
          scopeKey={`${user.companyId}:${user.id}`}
        />
      )}
    </div>
  );
}

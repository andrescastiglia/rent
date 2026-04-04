"use client";

import { useAuth } from "@/contexts/auth-context";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { ownersApi, OwnerSummary } from "@/lib/api/owners";
import { propertiesApi } from "@/lib/api/properties";
import { Property } from "@/types/property";
import { formatMoneyByCode } from "@/lib/format-money";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  FileText,
  Loader2,
  TrendingUp,
  ClipboardList,
} from "lucide-react";

function SummaryCard({
  label,
  value,
  icon: Icon,
  colorClass,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  colorClass: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm flex items-center gap-3">
      <div className={`rounded-lg p-2 ${colorClass}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {label}
        </p>
        <p className="text-lg font-bold text-gray-900 dark:text-white">
          {value}
        </p>
      </div>
    </div>
  );
}

export default function OwnerDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useLocalizedRouter();
  const locale = useLocale();
  const t = useTranslations("ownerPortal");

  const [summary, setSummary] = useState<OwnerSummary | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && user && user.role !== "owner") {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [summaryData, propertiesData] = await Promise.all([
        ownersApi.getMySummary(),
        propertiesApi.getAll(),
      ]);
      setSummary(summaryData);
      setProperties(propertiesData.slice(0, 5));
    } catch (error) {
      console.error("Error fetching owner dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user?.role === "owner") {
      void fetchData();
    }
  }, [authLoading, user, fetchData]);

  if (authLoading || loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (!user || user.role !== "owner") return null;

  const ownerBase = `/${locale}/portal/owner`;

  const currencyCode = summary?.currencyCode ?? "ARS";

  return (
    <div className="space-y-6">
      {/* Welcome card */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-5 text-white shadow">
        <p className="text-sm opacity-80">{t("welcome")}</p>
        <h1 className="text-2xl font-bold mt-1">{user.firstName}</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard
          label={t("propertiesCount")}
          value={summary?.propertiesCount ?? 0}
          icon={Building2}
          colorClass="bg-blue-500"
        />
        <SummaryCard
          label={t("activeLeases")}
          value={summary?.activeLeases ?? 0}
          icon={ClipboardList}
          colorClass="bg-green-500"
        />
        <SummaryCard
          label={t("pendingSettlements")}
          value={summary?.pendingSettlements ?? 0}
          icon={FileText}
          colorClass="bg-yellow-500"
        />
        <SummaryCard
          label={t("totalIncomeMonth")}
          value={formatMoneyByCode(
            summary?.totalIncomeCurrentMonth ?? 0,
            currencyCode,
            locale,
          )}
          icon={TrendingUp}
          colorClass="bg-purple-500"
        />
      </div>

      {/* Properties list */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
          {t("myProperties")}
        </h2>
        {properties.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("noProperties")}
          </p>
        ) : (
          <div className="space-y-2">
            {properties.map((property) => (
              <div
                key={property.id}
                className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {property.address?.street
                      ? `${property.address.street} ${property.address.number ?? ""}`.trim()
                      : property.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {property.operationState === "rented"
                      ? t("rented")
                      : t("available")}
                  </p>
                </div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 shrink-0">
                  {property.rentPrice
                    ? formatMoneyByCode(
                        Number(property.rentPrice),
                        currencyCode,
                        locale,
                      )
                    : "-"}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href={`${ownerBase}/properties`}
          className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm flex flex-col items-center gap-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors"
        >
          <Building2 className="h-6 w-6" />
          <span className="text-sm font-medium">{t("viewProperties")}</span>
        </Link>
        <Link
          href={`${ownerBase}/settlements`}
          className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm flex flex-col items-center gap-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors"
        >
          <FileText className="h-6 w-6" />
          <span className="text-sm font-medium">{t("viewSettlements")}</span>
        </Link>
      </div>
    </div>
  );
}

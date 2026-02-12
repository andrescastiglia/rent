"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, FileText } from "lucide-react";
import { dashboardApi, BatchReportRun } from "@/lib/api/dashboard";
import { useAuth } from "@/contexts/auth-context";

const PAGE_SIZE = 25;

export default function ReportsPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations("reports");
  const locale = useLocale();
  const [items, setItems] = useState<BatchReportRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total],
  );

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      const response = await dashboardApi.getReports(page, PAGE_SIZE);
      const sorted = [...response.data].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setItems(sorted);
      setTotal(response.total);
    } catch (error) {
      console.error("Failed to load reports", error);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    if (authLoading) return;
    void loadReports();
  }, [authLoading, loadReports]);

  const formatDateTime = (value: string | null) => {
    if (!value) return "-";
    return new Date(value).toLocaleString(locale, {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  const formatPeriod = (period: string | null) => {
    if (!period) return "-";
    const [year, month] = period.split("-");
    if (!year || !month) return period;
    return `${month}/${year}`;
  };

  const reportTypeLabel = (type: BatchReportRun["reportType"]) =>
    t(`types.${type}`);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {t("title")}
        </h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400">{t("subtitle")}</p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            {t("empty")}
          </h3>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3">{t("columns.type")}</th>
                  <th className="px-4 py-3">{t("columns.owner")}</th>
                  <th className="px-4 py-3">{t("columns.period")}</th>
                  <th className="px-4 py-3">{t("columns.status")}</th>
                  <th className="px-4 py-3">{t("columns.createdAt")}</th>
                  <th className="px-4 py-3">{t("columns.completedAt")}</th>
                  <th className="px-4 py-3">{t("columns.records")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                  >
                    <td className="px-4 py-3 text-gray-900 dark:text-white">
                      <div className="font-medium">
                        {reportTypeLabel(item.reportType)}
                      </div>
                      {item.dryRun ? (
                        <div className="text-xs text-amber-600 dark:text-amber-400">
                          {t("dryRun")}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">
                      {item.ownerName}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {formatPeriod(item.period)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                        {t(`status.${item.status}`)}
                      </span>
                      {item.errorMessage ? (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {item.errorMessage}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {formatDateTime(item.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {formatDateTime(item.completedAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {item.recordsProcessed}/{item.recordsTotal}
                      {item.recordsFailed > 0
                        ? ` (${t("failedCount", { count: item.recordsFailed })})`
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm">
            <p className="text-gray-600 dark:text-gray-400">
              {t("pagination", {
                page,
                totalPages,
                total,
              })}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50"
              >
                {t("prev")}
              </button>
              <button
                type="button"
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50"
              >
                {t("next")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useAuth } from "@/contexts/auth-context";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { settlementsApi } from "@/lib/api/settlements";
import { Settlement } from "@/types/settlement";
import { formatMoneyByCode } from "@/lib/format-money";
import { useTranslations, useLocale } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";

const STATUS_BADGE: Record<
  Settlement["status"],
  { label: string; className: string }
> = {
  pending: {
    label: "pending",
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  processing: {
    label: "processing",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  completed: {
    label: "completed",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  failed: {
    label: "failed",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
};

export default function OwnerSettlementsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useLocalizedRouter();
  const locale = useLocale();
  const t = useTranslations("ownerPortal");

  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user && user.role !== "owner") {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  const fetchSettlements = useCallback(async () => {
    try {
      setLoading(true);
      const data = await settlementsApi.getAll();
      setSettlements(data);
    } catch (error) {
      console.error("Error fetching settlements:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user?.role === "owner") {
      void fetchSettlements();
    }
  }, [authLoading, user, fetchSettlements]);

  const handleDownload = useCallback(
    async (settlement: Settlement) => {
      if (downloading) return;
      try {
        setDownloading(settlement.id);
        await settlementsApi.downloadReceipt(
          settlement.id,
          settlement.receiptName ?? undefined,
        );
      } catch (error) {
        console.error("Error downloading receipt:", error);
      } finally {
        setDownloading(null);
      }
    },
    [downloading],
  );

  if (authLoading || loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (!user || user.role !== "owner") return null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">
        {t("settlements")}
      </h1>

      {settlements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
          <FileText className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-sm">{t("noSettlements")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {settlements.map((settlement) => {
            const badge = STATUS_BADGE[settlement.status];
            const isCompleted = settlement.status === "completed";
            const isDownloading = downloading === settlement.id;
            const currency = settlement.currencyCode;

            return (
              <div
                key={settlement.id}
                className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {settlement.period}
                  </p>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
                  >
                    {t(`settlementStatus.${badge.label}`)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t("totalIncome")}
                    </p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {formatMoneyByCode(
                        settlement.totalIncome,
                        currency,
                        locale,
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t("commission")}
                    </p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {formatMoneyByCode(
                        settlement.commissionAmount,
                        currency,
                        locale,
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t("netAmount")}
                    </p>
                    <p className="font-semibold text-green-600 dark:text-green-400">
                      {formatMoneyByCode(
                        settlement.netAmount,
                        currency,
                        locale,
                      )}
                    </p>
                  </div>
                </div>

                {isCompleted && settlement.receiptPdfUrl && (
                  <button
                    type="button"
                    onClick={() => void handleDownload(settlement)}
                    disabled={isDownloading}
                    className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDownloading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {t("downloadReceipt")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

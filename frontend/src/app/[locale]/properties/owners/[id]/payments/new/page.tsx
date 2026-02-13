"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { ownersApi } from "@/lib/api/owners";
import { Owner, OwnerSettlementSummary } from "@/types/owner";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { formatMoneyByCode } from "@/lib/format-money";

export default function OwnerSettlementPaymentPage() {
  const t = useTranslations("properties");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useLocalizedRouter();
  const params = useParams();
  const ownerId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [settlements, setSettlements] = useState<OwnerSettlementSummary[]>([]);
  const [settlementId, setSettlementId] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!ownerId) return;
      setLoading(true);
      try {
        const [ownerData, pending] = await Promise.all([
          ownersApi.getById(ownerId),
          ownersApi.getSettlements(ownerId, "pending", 50),
        ]);
        setOwner(ownerData);
        setSettlements(pending);
        setSettlementId(pending[0]?.id ?? "");
      } catch (error) {
        console.error("Failed to load owner settlements", error);
      } finally {
        setLoading(false);
      }
    };

    load().catch((error) => {
      console.error("Failed to load owner settlements", error);
    });
  }, [ownerId]);

  const selectedSettlement = useMemo(
    () => settlements.find((item) => item.id === settlementId) ?? null,
    [settlements, settlementId],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ownerId || !selectedSettlement) return;

    try {
      setSaving(true);
      await ownersApi.registerSettlementPayment(
        ownerId,
        selectedSettlement.id,
        {
          paymentDate,
          reference: reference.trim() || undefined,
          notes: notes.trim() || undefined,
          amount: selectedSettlement.netAmount,
        },
      );
      router.push("/properties");
      router.refresh();
    } catch (error) {
      console.error("Failed to register settlement payment", error);
      alert(tCommon("error"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (!owner) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t("noOwners")}
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6">
        <Link
          href={`/${locale}/properties`}
          className="text-blue-600 hover:underline text-sm"
        >
          {t("backToProperties")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
          {t("registerOwnerPayment")}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {owner.firstName} {owner.lastName}
        </p>
      </div>

      {settlements.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-600 dark:text-gray-400">
          {t("ownerNoPendingSettlements")}
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("ownerSettlement")}
            </label>
            <select
              value={settlementId}
              onChange={(e) => setSettlementId(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
            >
              {settlements.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.period} -{" "}
                  {formatMoneyByCode(item.netAmount, item.currencyCode, locale)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("paymentDate")}
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("amountToPay")}
              </label>
              <input
                type="text"
                disabled
                value={
                  selectedSettlement
                    ? formatMoneyByCode(
                        selectedSettlement.netAmount,
                        selectedSettlement.currencyCode,
                        locale,
                      )
                    : "-"
                }
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 p-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("reference")}
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              placeholder={t("referencePlaceholder")}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("notes")}
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Link
              href={`/${locale}/properties`}
              className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
            >
              {tCommon("cancel")}
            </Link>
            <button
              type="submit"
              disabled={saving || !selectedSettlement}
              className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm disabled:opacity-60"
            >
              {saving ? tCommon("saving") : t("registerPayment")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

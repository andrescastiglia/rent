"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  settlementPayoutsApi,
  type PayoutSettlement,
} from "@/lib/api/settlement-payouts";
import { SettlementPayoutPanel } from "./SettlementPayoutPanel";
export function OwnerPayouts({ ownerId }: Readonly<{ ownerId: string }>) {
  const t = useTranslations("settlementPayouts");
  const locale = useLocale();
  const [settlements, setSettlements] = useState<PayoutSettlement[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    settlementPayoutsApi.list(ownerId).then(
      (data) => {
        if (!active) return;
        if (data.some((item) => item.ownerId !== ownerId)) {
          setError(true);
          setBusy(false);
          return;
        }
        setSettlements(data);
        setSelected(data[0]?.id ?? "");
        setBusy(false);
      },
      () => {
        if (active) {
          setError(true);
          setBusy(false);
        }
      },
    );
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [ownerId]);
  const reload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const data = await settlementPayoutsApi.list(ownerId);
      if (!mounted.current) return;
      if (data.some((item) => item.ownerId !== ownerId))
        throw new Error("Owner mismatch");
      setSettlements(data);
      setSelected((id) =>
        data.some((item) => item.id === id) ? id : (data[0]?.id ?? ""),
      );
      setError(false);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <Link href={`/${locale}/properties`} className="underline">
        {t("back")}
      </Link>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p>{t("intro")}</p>
      {error && <p role="alert">{t("listError")}</p>}
      <button
        type="button"
        className="rounded border px-4 py-2 disabled:opacity-50"
        disabled={busy}
        onClick={() => void reload()}
      >
        {busy ? t("loading") : t("reloadList")}
      </button>
      {!busy && !error && !settlements.length && (
        <p role="status">{t("empty")}</p>
      )}
      {!error && !!settlements.length && (
        <label className="block">
          {t("settlement")}
          <select
            className="block w-full rounded border p-2 bg-white text-gray-900 dark:bg-gray-900 dark:text-white"
            disabled={busy}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {settlements.map((item) => (
              <option value={item.id} key={item.id}>
                {item.period} · {item.netAmount} {item.currencyCode} ·{" "}
                {item.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      )}
      {!error && selected && (
        <SettlementPayoutPanel
          key={`${ownerId}:${selected}`}
          settlementId={selected}
          ownerId={ownerId}
        />
      )}
    </div>
  );
}

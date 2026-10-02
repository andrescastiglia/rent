"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  settlementPayoutsApi,
  type PayoutSettlement,
} from "@/lib/api/settlement-payouts";
import { SettlementPayoutPanel } from "./SettlementPayoutPanel";
import { SettlementGenerationForm } from "./SettlementGenerationForm";
import { SettlementGenerationPanel } from "./SettlementGenerationPanel";
export function OwnerPayouts(
  props: Readonly<{ ownerId: string; scopeKey: string }>,
) {
  return (
    <OwnerPayoutsContent
      key={`${props.scopeKey}:${props.ownerId}`}
      {...props}
    />
  );
}
function OwnerPayoutsContent({
  ownerId,
  scopeKey,
}: Readonly<{ ownerId: string; scopeKey: string }>) {
  const t = useTranslations("settlementPayouts");
  const locale = useLocale();
  const [settlements, setSettlements] = useState<PayoutSettlement[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const mounted = useRef(true);
  const loadSequence = useRef(0);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    const sequence = ++loadSequence.current;
    settlementPayoutsApi.list(ownerId).then(
      (data) => {
        if (!active || sequence !== loadSequence.current) return;
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
        if (active && sequence === loadSequence.current) {
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
  const reload = async (preferredId?: string) => {
    if (busy && !preferredId) return;
    const sequence = ++loadSequence.current;
    setBusy(true);
    try {
      const data = await settlementPayoutsApi.list(ownerId);
      if (!mounted.current || sequence !== loadSequence.current) return;
      if (data.some((item) => item.ownerId !== ownerId))
        throw new Error("Owner mismatch");
      setSettlements(data);
      setSelected((id) => {
        if (preferredId && data.some((item) => item.id === preferredId))
          return preferredId;
        if (data.some((item) => item.id === id)) return id;
        return data[0]?.id ?? "";
      });
      if (preferredId) setRevision((value) => value + 1);
      setError(false);
    } catch {
      if (mounted.current && sequence === loadSequence.current) setError(true);
    } finally {
      if (mounted.current && sequence === loadSequence.current) setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <Link href={`/${locale}/properties`} className="underline">
        {t("back")}
      </Link>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p>{t("intro")}</p>
      <SettlementGenerationForm
        ownerId={ownerId}
        scopeKey={scopeKey}
        onChanged={reload}
      />
      {error && <p role="alert">{t("listError")}</p>}
      <button
        type="button"
        className="rounded border px-4 py-2 disabled:opacity-50"
        disabled={busy}
        onClick={() => void reload()}
      >
        {busy ? t("loading") : t("reloadList")}
      </button>
      {!busy && !error && !settlements.length && <output>{t("empty")}</output>}
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
        <SettlementGenerationPanel
          key={`generation:${ownerId}:${selected}:${revision}`}
          settlementId={selected}
          ownerId={ownerId}
          onChanged={reload}
        />
      )}
      {!error && selected && (
        <SettlementPayoutPanel
          key={`${ownerId}:${selected}:${revision}`}
          settlementId={selected}
          ownerId={ownerId}
        />
      )}
    </div>
  );
}

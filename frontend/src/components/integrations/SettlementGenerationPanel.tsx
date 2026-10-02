"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  settlementGenerationsApi as api,
  type SettlementGenerationOverviewDto,
} from "@/lib/api/settlement-generations";
import { SettlementCalculationDetails } from "./SettlementCalculationDetails";
export function SettlementGenerationPanel({
  ownerId,
  settlementId,
  onChanged,
}: Readonly<{
  ownerId: string;
  settlementId: string;
  onChanged: (id: string) => Promise<void>;
}>) {
  const t = useTranslations("settlementGeneration");
  const [state, setState] = useState<SettlementGenerationOverviewDto | null>(
    null,
  );
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const mounted = useRef(true),
    inFlight = useRef(false);
  const validState = (value: SettlementGenerationOverviewDto) =>
    !value.generation ||
    (value.generation.settlementId === settlementId &&
      value.generation.snapshot.calculation.ownerId === ownerId);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    api.overview(ownerId, { settlementId }).then(
      (value) => {
        if (!active) return;
        if (
          value.generation &&
          (value.generation.settlementId !== settlementId ||
            value.generation.snapshot.calculation.ownerId !== ownerId)
        )
          setError(true);
        else setState(value);
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
  }, [ownerId, settlementId]);
  const refresh = async () => {
    if (inFlight.current || busy) return;
    inFlight.current = true;
    setBusy(true);
    setConfirmed(false);
    try {
      const value = await api.overview(ownerId, { settlementId });
      if (!mounted.current) return;
      if (!validState(value)) throw new Error("Generation scope mismatch");
      setState(value);
      setError(false);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const canVoid =
    !!state?.enabled &&
    !!state.canVoid &&
    state.generation?.state === "active" &&
    !busy &&
    !error;
  const validReason =
    reason.trim().length >= 10 && reason.trim().length <= 1000;
  const voidGeneration = async () => {
    if (inFlight.current || !canVoid || !confirmed || !validReason) return;
    inFlight.current = true;
    setBusy(true);
    setConfirmed(false);
    try {
      const generation = await api.void(settlementId, reason.trim());
      if (!mounted.current) return;
      if (
        generation.settlementId !== settlementId ||
        generation.snapshot.calculation.ownerId !== ownerId ||
        generation.state !== "voided"
      )
        throw new Error("Void scope mismatch");
      setState({ ...state!, generation, canVoid: false });
      setError(false);
      await onChanged(settlementId);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const generation = state?.generation;
  return (
    <section
      className="space-y-4 rounded-lg border p-5"
      aria-busy={busy}
      aria-label={t("auditTitle")}
    >
      <h2 className="text-xl font-semibold">{t("auditTitle")}</h2>
      {error && <p role="alert">{t("auditError")}</p>}
      <button
        className="rounded border px-4 py-2 disabled:opacity-50"
        type="button"
        disabled={busy}
        onClick={() => void refresh()}
      >
        {busy ? t("loading") : t("refreshAudit")}
      </button>
      {state && !state.enabled && <output>{t("disabled")}</output>}
      {state && !generation && !error && <p>{t("legacy")}</p>}
      {generation && (
        <>
          <p>{t(generation.state === "voided" ? "voided" : "active")}</p>
          <p>
            {t("period")}: {generation.snapshot.calculation.period}
          </p>
          <SettlementCalculationDetails
            calculation={generation.snapshot.calculation}
          />
          <p>
            {t("deductions")}: {generation.snapshot.additionalWithholdings}{" "}
            {generation.snapshot.calculation.currency}
          </p>
          <p className="break-words">{generation.snapshot.withholdingReason}</p>
          <p className="font-semibold">
            {t("net")}: {generation.snapshot.netAmount}{" "}
            {generation.snapshot.calculation.currency}
          </p>
          {generation.state === "voided" ? (
            <div>
              <p>
                {t("voidDate")}: {generation.voidedAt}
              </p>
              <p className="break-words">{generation.voidReason}</p>
            </div>
          ) : (
            <>
              {!state?.canVoid && <p>{t("cannotVoid")}</p>}
              <fieldset disabled={!canVoid} className="space-y-3">
                <label className="block">
                  {t("voidReason")}
                  <textarea
                    className="block w-full rounded border p-2 bg-white text-gray-900 dark:bg-gray-900 dark:text-white"
                    value={reason}
                    minLength={10}
                    maxLength={1000}
                    onChange={(e) => {
                      setReason(e.target.value);
                      setConfirmed(false);
                    }}
                  />
                </label>
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  {t("confirmVoid")}
                </label>
              </fieldset>
              <button
                className="rounded border px-4 py-2 disabled:opacity-50"
                type="button"
                disabled={!canVoid || !confirmed || !validReason}
                onClick={() => void voidGeneration()}
              >
                {t("void")}
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}

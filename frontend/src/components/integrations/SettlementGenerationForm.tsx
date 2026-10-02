"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ApiRequestError } from "@/lib/api";
import {
  settlementGenerationsApi as api,
  type SettlementCalculationDto,
  type SettlementGenerationDto,
} from "@/lib/api/settlement-generations";
import {
  readPendingGeneration,
  settlementNet,
  type PendingGeneration,
} from "@/lib/settlement-generation";
import { SettlementCalculationDetails } from "./SettlementCalculationDetails";
const inputClass =
  "block w-full rounded border p-2 bg-white text-gray-900 dark:bg-gray-900 dark:text-white";
const buttonClass = "rounded border px-4 py-2 disabled:opacity-50";
function isDefinitiveGenerationError(error: unknown, retry: boolean): boolean {
  return (
    !retry &&
    error instanceof ApiRequestError &&
    [400, 401, 403, 404, 409, 503].includes(error.status)
  );
}
export function SettlementGenerationForm({
  ownerId,
  scopeKey,
  onChanged,
}: Readonly<{
  ownerId: string;
  scopeKey: string;
  onChanged: (id: string) => Promise<void>;
}>) {
  const t = useTranslations("settlementGeneration");
  const storageKey = `rent:settlement-generation:${scopeKey}:${ownerId}`;
  const [period, setPeriod] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
  const [currency, setCurrency] = useState("ARS");
  const [deductions, setDeductions] = useState("0.00");
  const [reason, setReason] = useState("");
  const [calculation, setCalculation] =
    useState<SettlementCalculationDto | null>(null);
  const [pending, setPending] = useState<PendingGeneration | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [discardConfirmed, setDiscardConfirmed] = useState(false);
  const [fault, setFault] = useState<string | null>(null);
  const [storageFault, setStorageFault] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    Promise.all([
      api.overview(ownerId),
      Promise.resolve().then(() => {
        try {
          const saved = readPendingGeneration(storageKey, ownerId);
          if (active) setPending(saved);
          return saved;
        } catch (error) {
          if (active) setStorageFault(true);
          throw error;
        }
      }),
    ]).then(
      ([state, saved]) => {
        if (!active) return;
        setEnabled(state.enabled);
        setReady(true);
        setPending(saved);
        setBusy(false);
      },
      () => {
        if (active) {
          setFault("loadError");
          setBusy(false);
        }
      },
    );
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [ownerId, storageKey]);
  const net = calculation
    ? settlementNet(calculation.netBeforeWithholdings, deductions)
    : null;
  const validQuery =
    /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(period) && /^[A-Z]{3}$/.test(currency);
  const canGenerate =
    ready &&
    enabled &&
    !busy &&
    !storageFault &&
    !pending &&
    !!calculation?.invoices.length &&
    !!net &&
    reason.trim().length >= 10 &&
    reason.trim().length <= 1000 &&
    confirmed;
  const forget = () => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      setStorageFault(true);
    }
    setPending(null);
  };
  const accept = async (
    generation: SettlementGenerationDto,
    attempt: PendingGeneration,
  ) => {
    const source = generation.snapshot.calculation;
    if (
      source.ownerId !== ownerId ||
      source.period !== attempt.request.period ||
      source.currency !== attempt.request.currency ||
      source.fingerprint !== attempt.request.expectedFingerprint ||
      generation.snapshot.netAmount !== attempt.netAmount
    )
      throw new Error("Generation scope mismatch");
    if (!mounted.current) return;
    forget();
    setCalculation(null);
    setConfirmed(false);
    setFault(null);
    setNotice(generation.state === "voided" ? "recoveredVoided" : "generated");
    try {
      await onChanged(generation.settlementId);
    } catch {
      if (mounted.current) setFault("historyError");
    }
  };
  const preview = async () => {
    if (inFlight.current || busy || pending || !validQuery) return;
    inFlight.current = true;
    setBusy(true);
    setConfirmed(false);
    setFault(null);
    setNotice(null);
    setCalculation(null);
    try {
      const [state, value] = await Promise.all([
        api.overview(ownerId),
        api.preview(ownerId, period, currency),
      ]);
      if (!mounted.current) return;
      if (
        value.ownerId !== ownerId ||
        value.period !== period ||
        value.currency !== currency
      )
        throw new Error("Preview scope mismatch");
      setEnabled(state.enabled);
      setReady(true);
      setCalculation(value);
    } catch {
      if (mounted.current) setFault("previewError");
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const send = async (retry = false) => {
    if (
      inFlight.current ||
      busy ||
      !ready ||
      !enabled ||
      storageFault ||
      (!retry && !canGenerate) ||
      (retry && !pending)
    )
      return;
    let attempt: PendingGeneration;
    try {
      attempt = retry
        ? pending!
        : {
            request: {
              ownerId,
              period,
              currency,
              idempotencyKey: crypto.randomUUID(),
              expectedFingerprint: calculation!.fingerprint,
              confirmed: true as const,
              additionalWithholdings: deductions,
              withholdingReason: reason.trim(),
            },
            netAmount: net!,
          };
      sessionStorage.setItem(storageKey, JSON.stringify(attempt));
    } catch {
      setStorageFault(true);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setPending(attempt);
    setConfirmed(false);
    setFault(null);
    try {
      await accept(await api.generate(attempt.request), attempt);
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ApiRequestError && error.status === 503)
        setEnabled(false);
      if (isDefinitiveGenerationError(error, retry)) {
        forget();
        setCalculation(null);
        setFault("generateError");
      } else setFault("uncertain");
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const discard = async () => {
    if (inFlight.current || busy || !pending || !discardConfirmed) return;
    inFlight.current = true;
    setBusy(true);
    setDiscardConfirmed(false);
    setFault(null);
    try {
      const value = await api.cancelRequest(
        ownerId,
        pending.request.idempotencyKey,
      );
      if (!mounted.current) return;
      setEnabled(value.enabled);
      if (value.generation) await accept(value.generation, pending);
      else if (value.requestCancelled) {
        forget();
        setCalculation(null);
        setConfirmed(false);
        setNotice("discarded");
      } else throw new Error("Cancellation was not confirmed");
    } catch {
      if (mounted.current) setFault("uncertain");
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const recover = async () => {
    if (inFlight.current || busy) return;
    inFlight.current = true;
    setBusy(true);
    setFault(null);
    setConfirmed(false);
    try {
      const saved = pending ?? readPendingGeneration(storageKey, ownerId);
      const state = await api.overview(
        ownerId,
        saved ? { requestKey: saved.request.idempotencyKey } : {},
      );
      if (!mounted.current) return;
      setEnabled(state.enabled);
      setReady(true);
      setPending(saved);
      if (saved && state.generation) await accept(state.generation, saved);
      else if (saved && state.requestCancelled) {
        forget();
        setCalculation(null);
        setNotice("discarded");
      } else if (saved) setFault("notFoundYet");
    } catch {
      if (mounted.current) setFault("loadError");
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const invalidate = () => {
    setCalculation(null);
    setConfirmed(false);
    setNotice(null);
  };
  const refreshLabel = pending ? "recover" : "refresh";
  return (
    <section
      className="space-y-4 rounded-lg border p-5"
      aria-busy={busy}
      aria-label={t("title")}
    >
      <h2 className="text-xl font-semibold">{t("title")}</h2>
      <p>{t("intro")}</p>
      {ready && !enabled && <output>{t("disabled")}</output>}
      {fault && <p role="alert">{t(fault)}</p>}
      {storageFault && <p role="alert">{t("storageError")}</p>}
      {notice && <output>{t(notice)}</output>}
      <button
        type="button"
        className={buttonClass}
        disabled={busy}
        onClick={() => void recover()}
      >
        {t(busy ? "loading" : refreshLabel)}
      </button>
      {pending ? (
        <div className="space-y-3">
          <p>
            {t("pending", {
              period: pending.request.period,
              amount: pending.netAmount,
              currency: pending.request.currency,
            })}
          </p>
          <p>
            {t("deductions")}: {pending.request.additionalWithholdings}{" "}
            {pending.request.currency}
          </p>
          <p className="break-words">{pending.request.withholdingReason}</p>
          <button
            type="button"
            className={buttonClass}
            disabled={busy || !enabled || storageFault}
            onClick={() => void send(true)}
          >
            {t("retrySame")}
          </button>
          <label className="flex gap-2">
            <input
              type="checkbox"
              disabled={busy}
              checked={discardConfirmed}
              onChange={(e) => setDiscardConfirmed(e.target.checked)}
            />
            {t("confirmDiscard")}
          </label>
          <button
            type="button"
            className={buttonClass}
            disabled={busy || !discardConfirmed}
            onClick={() => void discard()}
          >
            {t("discard")}
          </button>
        </div>
      ) : (
        <>
          <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
            <label>
              {t("period")}
              <input
                className={inputClass}
                type="month"
                value={period}
                onChange={(e) => {
                  setPeriod(e.target.value);
                  invalidate();
                }}
              />
            </label>
            <label>
              {t("currency")}
              <input
                className={inputClass}
                maxLength={3}
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value.toUpperCase());
                  invalidate();
                }}
              />
            </label>
          </fieldset>
          <button
            type="button"
            className={buttonClass}
            disabled={busy || !validQuery}
            onClick={() => void preview()}
          >
            {t("preview")}
          </button>
          {calculation && (
            <>
              {!!calculation.existingSettlementIds.length && (
                <p>{t("existing")}</p>
              )}
              {!calculation.invoices.length ? (
                <output>{t("empty")}</output>
              ) : (
                <>
                  <SettlementCalculationDetails calculation={calculation} />
                  <fieldset
                    disabled={busy || !enabled || storageFault}
                    className="space-y-3"
                  >
                    <label className="block">
                      {t("deductions")}
                      <input
                        className={inputClass}
                        inputMode="decimal"
                        value={deductions}
                        onChange={(e) => {
                          setDeductions(e.target.value);
                          setConfirmed(false);
                        }}
                      />
                    </label>
                    <label className="block">
                      {t("deductionReason")}
                      <textarea
                        className={inputClass}
                        minLength={10}
                        maxLength={1000}
                        value={reason}
                        onChange={(e) => {
                          setReason(e.target.value);
                          setConfirmed(false);
                        }}
                      />
                    </label>
                    <p>
                      {t("net")}: {net ?? t("invalidNet")}{" "}
                      {calculation.currency}
                    </p>
                    <label className="flex gap-2">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      {t("confirm", {
                        amount: net ?? "—",
                        currency: calculation.currency,
                      })}
                    </label>
                  </fieldset>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={!canGenerate}
                    onClick={() => void send()}
                  >
                    {t("generate")}
                  </button>
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

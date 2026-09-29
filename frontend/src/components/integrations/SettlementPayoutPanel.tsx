"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  settlementPayoutsApi as api,
  type PayoutSettlement,
  type RequestSettlementPayoutDto,
  type ReviewSettlementPayoutDto,
  type SettlementPayoutOverviewDto,
} from "@/lib/api/settlement-payouts";

const inputClass =
  "block w-full rounded border p-2 bg-white text-gray-900 dark:bg-gray-900 dark:text-white";
const buttonClass = "rounded border px-4 py-2 disabled:opacity-50";
const statuses = [
  "queued",
  "dispatching",
  "awaiting",
  "completed",
  "failed",
  "needs_review",
  "reversed",
];
type Bank = NonNullable<RequestSettlementPayoutDto["bankAccount"]>;
const emptyBank: Bank = {
  accountType: "checking",
  holder: "",
  number: "",
  bankId: "",
  ownerValue: "",
  ownerType: "",
};
export function SettlementPayoutPanel({
  settlementId,
  ownerId,
}: Readonly<{ settlementId: string; ownerId: string }>) {
  const t = useTranslations("settlementPayouts");
  const [settlement, setSettlement] = useState<PayoutSettlement | null>(null);
  const [overview, setOverview] = useState<SettlementPayoutOverviewDto | null>(
    null,
  );
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [mode, setMode] = useState("email");
  const [email, setEmail] = useState("");
  const [bank, setBank] = useState<Bank>(emptyBank);
  const [action, setAction] = useState<
    ReviewSettlementPayoutDto["action"] | ""
  >("");
  const [reason, setReason] = useState("");
  const [payoutId, setPayoutId] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    Promise.all([
      api.settlement(settlementId),
      api.overview(settlementId),
    ]).then(
      ([current, state]) => {
        if (!active) return;
        if (current.ownerId !== ownerId) {
          setError(true);
          setBusy(false);
          return;
        }
        setSettlement(current);
        setOverview(state);
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
  }, [settlementId, ownerId]);
  const job = overview?.job;
  const canWrite = !!overview?.enabled && !busy && !error;
  const amount = settlement?.netAmount ?? "";
  const validAmount =
    /^\d{1,11}\.\d{2}$/.test(amount) &&
    Number(amount) >= 1 &&
    Number(amount) <= 10000000000;
  const canRequest =
    !job &&
    settlement?.status === "pending" &&
    !settlement.transferReference &&
    settlement.currencyCode === "ARS" &&
    validAmount;
  const actions: ReviewSettlementPayoutDto["action"][] = [];
  if (job?.status === "needs_review" && !job.payoutId) actions.push("link");
  if (
    job?.status === "failed" &&
    !job.payoutId &&
    ["provider_rejected", "configuration_error"].includes(job.errorCode ?? "")
  )
    actions.push("retry");
  if (
    job?.payoutId &&
    ["failed", "needs_review", "completed", "reversed"].includes(job.status)
  )
    actions.push("refresh");
  const validReview =
    !!action &&
    actions.includes(action) &&
    reason.trim().length >= 10 &&
    reason.trim().length <= 1000 &&
    (action !== "link" ||
      (/^POP[A-Za-z0-9]{1,100}$/.test(payoutId.trim()) &&
        /^TOP[A-Za-z0-9]{1,100}$/.test(transactionId.trim())));
  const perform = async (operation: "read" | "request" | "review") => {
    if (
      inFlight.current ||
      busy ||
      (operation !== "read" && (!canWrite || !confirmed))
    )
      return;
    if (operation === "request" && !canRequest) return;
    if (operation === "review" && !validReview) return;
    inFlight.current = true;
    setBusy(true);
    setConfirmed(false);
    try {
      if (operation === "request")
        await api.request(settlementId, {
          confirmed: true,
          expectedAmount: amount,
          currency: "ARS",
          ...(mode === "email"
            ? { recipientEmail: email.trim() }
            : {
                bankAccount: {
                  ...bank,
                  holder: bank.holder.trim(),
                  branch: bank.branch || undefined,
                },
              }),
        });
      if (operation === "review")
        await api.review(settlementId, {
          confirmed: true,
          action: action as ReviewSettlementPayoutDto["action"],
          reason: reason.trim(),
          ...(action === "link"
            ? { payoutId: payoutId.trim(), transactionId: transactionId.trim() }
            : {}),
        });
      const [current, state] = await Promise.all([
        api.settlement(settlementId),
        api.overview(settlementId),
      ]);
      if (!mounted.current) return;
      if (current.ownerId !== ownerId) throw new Error("Owner changed");
      setSettlement(current);
      setOverview(state);
      setError(false);
      setAction("");
      setReason("");
      setEmail("");
      setBank(emptyBank);
      setPayoutId("");
      setTransactionId("");
    } catch {
      if (mounted.current) setError(true);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const download = async (movementId: string) => {
    if (downloading || busy) return;
    setDownloading(true);
    setDownloadError(false);
    try {
      await api.downloadReceipt(settlementId, movementId);
    } catch {
      if (mounted.current) setDownloadError(true);
    } finally {
      if (mounted.current) setDownloading(false);
    }
  };
  const status = job
    ? statuses.includes(job.status)
      ? job.status
      : "unknown"
    : "none";
  return (
    <section aria-busy={busy} className="space-y-5 rounded-lg border p-5">
      <h2 className="text-xl font-semibold">{t("detail")}</h2>
      {busy && <p role="status">{t("loading")}</p>}
      {error && <p role="alert">{t("error")}</p>}
      {downloadError && <p role="alert">{t("receiptError")}</p>}
      {overview && !overview.enabled && <p role="status">{t("disabled")}</p>}
      <button
        type="button"
        className={buttonClass}
        disabled={busy}
        onClick={() => void perform("read")}
      >
        {t("reload")}
      </button>
      {settlement && (
        <p>
          {settlement.period} · {amount} {settlement.currencyCode}
        </p>
      )}
      {overview && <p role="status">{t(`status.${status}`)}</p>}
      {job?.transactionId && (
        <p className="break-all">
          {t("transactionId")}: {job.transactionId}
        </p>
      )}
      {job?.payoutId && (
        <p className="break-all">
          {t("payoutId")}: {job.payoutId}
        </p>
      )}
      {job?.remoteStatus && (
        <p>
          {t("providerStatus")}: {job.remoteStatus} / {job.remoteDetail ?? "—"}
        </p>
      )}
      {job?.errorCode === "partial_refund_requires_review" && (
        <p role="status">{t("partialRefund")}</p>
      )}
      {overview && !job && !canRequest && <p>{t("ineligible")}</p>}
      {canRequest && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void perform("request");
          }}
          onChange={() => setConfirmed(false)}
          className="space-y-4"
        >
          <fieldset disabled={!canWrite} className="space-y-4">
            <legend className="font-semibold">{t("destination")}</legend>
            <label className="block">
              {t("destinationType")}
              <select
                className={inputClass}
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="email">{t("emailOption")}</option>
                <option value="bank">{t("bankOption")}</option>
              </select>
            </label>
            {mode === "email" ? (
              <label className="block">
                {t("email")}
                <input
                  className={inputClass}
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            ) : (
              <>
                <p>{t("checkingOnly")}</p>
                {(
                  [
                    "holder",
                    "number",
                    "bankId",
                    "branch",
                    "ownerValue",
                    "ownerType",
                  ] as const
                ).map((field) => (
                  <label className="block" key={field}>
                    {t(`bank.${field}`)}
                    <input
                      className={inputClass}
                      required={field !== "branch"}
                      autoComplete="off"
                      maxLength={
                        {
                          holder: 200,
                          number: 34,
                          bankId: 3,
                          branch: 10,
                          ownerValue: 20,
                          ownerType: 10,
                        }[field]
                      }
                      pattern={
                        {
                          holder: ".*\\S.*",
                          number: "[0-9]{1,34}",
                          bankId: "[0-9]{3}",
                          branch: "[0-9]{1,10}",
                          ownerValue: "[0-9]{1,20}",
                          ownerType: "[A-Z]{2,10}",
                        }[field]
                      }
                      value={bank[field] ?? ""}
                      onChange={(e) =>
                        setBank((old) => ({ ...old, [field]: e.target.value }))
                      }
                    />
                  </label>
                ))}
              </>
            )}
          </fieldset>
          <p>{t("requestNotice")}</p>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={!canWrite}
              onChange={(e) => {
                e.stopPropagation();
                setConfirmed(e.target.checked);
              }}
            />
            {t("confirmRequest", {
              amount,
              currency: "ARS",
              destination:
                mode === "email"
                  ? email
                  : `${bank.holder} · ${bank.bankId} · ${bank.number}`,
            })}
          </label>
          <button
            className={buttonClass}
            disabled={!canWrite || !confirmed}
            type="submit"
          >
            {t("request")}
          </button>
        </form>
      )}
      {!!actions.length && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void perform("review");
          }}
          onChange={() => setConfirmed(false)}
          className="space-y-4"
        >
          <fieldset disabled={!canWrite} className="space-y-4">
            <legend className="font-semibold">{t("review")}</legend>
            <label className="block">
              {t("actionLabel")}
              <select
                className={inputClass}
                value={action}
                onChange={(e) => setAction(e.target.value as typeof action)}
              >
                <option value="">{t("chooseAction")}</option>
                {actions.map((value) => (
                  <option key={value} value={value}>
                    {t(`action.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            {action && <p>{t(`actionHelp.${action}`)}</p>}
            {action === "link" && (
              <>
                <label className="block">
                  {t("payoutId")}
                  <input
                    className={inputClass}
                    required
                    pattern="POP[A-Za-z0-9]{1,100}"
                    value={payoutId}
                    onChange={(e) => setPayoutId(e.target.value)}
                  />
                </label>
                <label className="block">
                  {t("transactionId")}
                  <input
                    className={inputClass}
                    required
                    pattern="TOP[A-Za-z0-9]{1,100}"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                  />
                </label>
              </>
            )}
            <label className="block">
              {t("reason")}
              <textarea
                className={inputClass}
                required
                minLength={10}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </fieldset>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={!canWrite}
              onChange={(e) => {
                e.stopPropagation();
                setConfirmed(e.target.checked);
              }}
            />
            {t("confirmReview")}
          </label>
          <button
            type="submit"
            className={buttonClass}
            disabled={!canWrite || !validReview || !confirmed}
          >
            {t("applyReview")}
          </button>
        </form>
      )}
      {!!overview?.movements.length && (
        <div>
          <h3 className="font-semibold">{t("movements")}</h3>
          <ul className="space-y-2">
            {overview.movements.map((item) => (
              <li key={item.id} className="break-words">
                {t(item.kind === "transfer" ? "transfer" : "reversal")} ·{" "}
                {item.amount} {item.currency} · {item.providerUpdatedAt} ·{" "}
                {item.transactionId}
                {!item.receiptAvailable && (
                  <p>
                    {t(
                      item.receiptStatus === "dead_letter"
                        ? "receiptNeedsReview"
                        : "receiptPending",
                    )}
                  </p>
                )}
                {item.receiptAvailable && (
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy || downloading}
                    onClick={() => void download(item.id)}
                  >
                    {t("downloadReceipt")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!!overview?.reviews.length && (
        <div>
          <h3 className="font-semibold">{t("history")}</h3>
          <ul className="space-y-2">
            {overview.reviews.map((item) => (
              <li key={item.id} className="break-words">
                {["retry", "link", "refresh"].includes(item.action)
                  ? t(`action.${item.action}`)
                  : item.action}{" "}
                · {item.createdAt} · {t("actor")}: {item.actorId}
                <p>{item.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

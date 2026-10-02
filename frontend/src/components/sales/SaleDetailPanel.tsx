"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { salesApi } from "@/lib/api/sales";
import { ApiRequestError } from "@/lib/api";
import {
  completeDomainAttempt,
  prepareDomainAttempt,
  type DomainAttempt,
} from "@/lib/domain-operation";
import { formatMoneyByCode } from "@/lib/format-money";
import {
  Button,
  DataTable,
  Dialog,
  FormField,
  Pagination,
  StatePanel,
  StatusBadge,
  Surface,
} from "@/components/ui";
import FinancialCorrectionDialog from "@/components/payments/FinancialCorrectionDialog";
import type {
  CreateSaleReceiptInput,
  SaleAgreement,
  SaleReceipt,
  SaleSchedule,
} from "@/types/sales";

const rejectedStatuses = new Set([400, 403, 404, 409, 422]);
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
function mergeReceipts(
  previous: SaleReceipt[],
  current: SaleReceipt[],
): SaleReceipt[] {
  const result = new Map(current.map((receipt) => [receipt.id, receipt]));
  for (const receipt of previous)
    if (!result.has(receipt.id)) result.set(receipt.id, receipt);
  return [...result.values()];
}

export default function SaleDetailPanel({
  agreement,
  onChanged,
  readOnly = false,
}: Readonly<{
  agreement: SaleAgreement;
  onChanged: () => void;
  readOnly?: boolean;
}>) {
  const { user } = useAuth();
  const locale = useLocale();
  const t = useTranslations("sales");
  const tw = useTranslations("salesWorkspace");
  const tc = useTranslations("common");
  const tf = useTranslations("financialCorrection");
  const [receipts, setReceipts] = useState<SaleReceipt[]>([]);
  const [schedule, setSchedule] = useState<SaleSchedule>();
  const [schedulePage, setSchedulePage] = useState(1);
  const [scheduleError, setScheduleError] = useState(false);
  const [receiptsError, setReceiptsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [downloading, setDownloading] = useState<string>();
  const [downloadError, setDownloadError] = useState(false);
  const [form, setForm] = useState<CreateSaleReceiptInput>({
    amount: 0,
    paymentDate: today(),
  });
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [pending, setPending] = useState<{
    dto: CreateSaleReceiptInput;
    attempt: DomainAttempt;
  }>();
  const [error, setError] = useState<string>();
  const [cancelling, setCancelling] = useState<SaleReceipt>();
  const [success, setSuccess] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const reloadReceipts = useCallback(async () => {
    try {
      const items = await salesApi.getReceipts(agreement.id);
      if (mounted.current) {
        setReceipts(items);
        setReceiptsError(false);
      }
    } catch {
      if (mounted.current) setReceiptsError(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [agreement.id]);
  useEffect(() => {
    void reloadReceipts();
  }, [reloadReceipts, revision]);
  useEffect(() => {
    let cancelled = false;
    setScheduleError(false);
    salesApi
      .getSchedule(agreement.id, schedulePage)
      .then((data) => {
        if (!cancelled) setSchedule(data);
      })
      .catch(() => {
        if (!cancelled) setScheduleError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [agreement.id, schedulePage, revision]);
  const pendingPdf = receipts.some(
    (receipt) => !receipt.pdfUrl && receipt.status !== "cancelled",
  );
  useEffect(() => {
    if (!pendingPdf) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const current = await salesApi.getReceipts(agreement.id);
        if (!cancelled)
          setReceipts((previous) => mergeReceipts(previous, current));
      } catch {
        /* The next document refresh retries the read only. */
      }
      if (!cancelled) timer = setTimeout(refresh, 5000);
    };
    timer = setTimeout(refresh, 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [agreement.id, pendingPdf]);

  const createReceipt = async () => {
    if (
      inFlight.current ||
      !user?.companyId ||
      !user.id ||
      form.amount <= 0 ||
      !form.paymentDate
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    let sent = false;
    let attempted: DomainAttempt | undefined;
    try {
      const operation = pending ?? {
        dto: { ...form },
        attempt: await prepareDomainAttempt(
          "sale-receipt",
          {
            companyId: user.companyId,
            userId: user.id,
            entityId: agreement.id,
          },
          form,
        ),
      };
      if (!mounted.current) return;
      attempted = operation.attempt;
      setPending(operation);
      sent = true;
      const created = await salesApi.createReceipt(
        agreement.id,
        operation.dto,
        operation.attempt.idempotencyKey,
      );
      completeDomainAttempt(operation.attempt);
      if (!mounted.current) return;
      setPending(undefined);
      setReceipts((previous) => mergeReceipts([created], previous));
      setForm({ amount: 0, paymentDate: today() });
      setReview(false);
      setSuccess(true);
      setRevision((value) => value + 1);
      onChanged();
    } catch (error_) {
      if (!mounted.current) return;
      const rejected =
        !pending &&
        !attempted?.recovered &&
        error_ instanceof ApiRequestError &&
        rejectedStatuses.has(error_.status);
      if (rejected && attempted) {
        completeDomainAttempt(attempted);
        setPending(undefined);
      }
      let message = "uncertain";
      if (!sent) message = "storageError";
      else if (rejected) message = "rejected";
      setError(message);
      setReview(false);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const download = async (receipt: SaleReceipt) => {
    setDownloading(receipt.id);
    setDownloadError(false);
    try {
      await salesApi.downloadReceiptPdf(receipt.id, receipt.receiptNumber);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(undefined);
    }
  };
  const money = (value: number, currency = agreement.currency) =>
    formatMoneyByCode(value, currency, locale);
  let scheduleContent = <StatePanel busy title={tc("loading")} />;
  if (scheduleError)
    scheduleContent = (
      <StatePanel
        error
        title={tw("scheduleError")}
        action={
          <Button
            variant="secondary"
            onClick={() => setRevision((value) => value + 1)}
          >
            {tc("retry")}
          </Button>
        }
      />
    );
  else if (schedule)
    scheduleContent = (
      <>
        <div className="flex flex-wrap gap-6 text-sm">
          <p>
            {tw("paid")}:{" "}
            <strong className="tabular-nums">
              {money(schedule.paidAmount)}
            </strong>
          </p>
          <p>
            {t("agreements.balance")}:{" "}
            <strong className="tabular-nums">{money(schedule.balance)}</strong>
          </p>
          <p>
            {tw("overdue")}:{" "}
            <strong className="tabular-nums">
              {money(schedule.overdueAmount)}
            </strong>
          </p>
          {schedule.credit > 0 && (
            <p>
              {t("agreements.creditBalance")}:{" "}
              <strong className="tabular-nums">{money(schedule.credit)}</strong>
            </p>
          )}
        </div>
        <DataTable
          items={schedule.data}
          rowKey={(item) => item.installmentNumber}
          caption={tw("schedule")}
          emptyTitle={tw("empty")}
          columns={[
            {
              key: "number",
              title: tw("installment"),
              render: (item) => item.installmentNumber,
            },
            {
              key: "due",
              title: tw("dueDate"),
              render: (item) => item.dueDate,
            },
            {
              key: "amount",
              title: tw("amount"),
              align: "right",
              render: (item) => money(item.amount),
            },
            {
              key: "paid",
              title: tw("paid"),
              align: "right",
              render: (item) => money(item.paidAmount),
            },
            {
              key: "balance",
              title: t("agreements.balance"),
              align: "right",
              render: (item) => money(item.balance),
            },
            {
              key: "status",
              title: tw("status"),
              render: (item) => (
                <StatusBadge
                  tone={item.status === "overdue" ? "warning" : "neutral"}
                >
                  {tw(`installmentStatuses.${item.status}`)}
                </StatusBadge>
              ),
            },
          ]}
          renderMobileSummary={(item) => (
            <div className="space-y-1">
              <p className="font-semibold">
                {tw("installment")} {item.installmentNumber} · {item.dueDate}
              </p>
              <p className="tabular-nums">
                {tw("amount")}: {money(item.amount)} · {t("agreements.balance")}
                : {money(item.balance)}
              </p>
              <p>{tw(`installmentStatuses.${item.status}`)}</p>
            </div>
          )}
        />
        <Pagination
          page={schedulePage}
          pageSize={12}
          total={schedule.total}
          onPageChange={setSchedulePage}
        />
      </>
    );
  return (
    <Surface className="space-y-6 p-4 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold">{agreement.buyerName}</h2>
        <p className="mt-1 text-sm text-muted">
          {agreement.buyerPhone} · {agreement.currency} ·{" "}
          {agreement.installmentCount} {t("agreements.installments")}
        </p>
      </div>
      <section className="space-y-4">
        <h3 className="font-semibold">{tw("schedule")}</h3>
        {scheduleContent}
      </section>
      {!readOnly && (
        <section className="space-y-4">
          <h3 className="font-semibold">{tw("recordReceipt")}</h3>
          <form
            className="grid gap-3 sm:grid-cols-3"
            aria-busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              if (pending) void createReceipt();
              else setReview(true);
            }}
          >
            <FormField id="sale-receipt-amount" label={t("receipts.amount")}>
              {(attributes) => (
                <input
                  {...attributes}
                  className="ui-field"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  disabled={busy || Boolean(pending)}
                  value={form.amount || ""}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      amount: Number(event.target.value),
                    }))
                  }
                />
              )}
            </FormField>
            <FormField id="sale-receipt-date" label={t("receipts.paymentDate")}>
              {(attributes) => (
                <input
                  {...attributes}
                  className="ui-field"
                  type="date"
                  required
                  disabled={busy || Boolean(pending)}
                  value={form.paymentDate}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      paymentDate: event.target.value,
                    }))
                  }
                />
              )}
            </FormField>
            <Button
              type="submit"
              className="self-end"
              disabled={form.amount <= 0 || !user?.companyId}
              busy={busy}
            >
              {t(pending ? "receipts.recover" : "receipts.create")}
            </Button>
          </form>
          {error && <p role="alert">{t(`receipts.${error}`)}</p>}
          {success && (
            <output className="block text-sm text-emerald-700 dark:text-emerald-300">
              {tw("receiptSuccess")}
            </output>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h3 className="font-semibold">{tw("receipts")}</h3>
        {downloadError && <p role="alert">{t("receipts.downloadError")}</p>}
        {loading && <StatePanel busy title={tc("loading")} />}
        {receiptsError && (
          <StatePanel
            error
            title={tw("receiptsError")}
            action={
              <Button variant="secondary" onClick={() => void reloadReceipts()}>
                {tc("retry")}
              </Button>
            }
          />
        )}
        {receipts.map((receipt) => (
          <div
            key={receipt.id}
            className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3"
          >
            <div>
              <p className="font-semibold">{receipt.receiptNumber}</p>
              <p className="text-sm text-muted">
                {receipt.paymentDate.slice(0, 10)} ·{" "}
                {money(receipt.amount, receipt.currency)}
              </p>
              <p className="text-xs text-muted">
                {Number(receipt.balanceAfter) < 0
                  ? t("agreements.creditBalance")
                  : t("receipts.balanceAfter")}
                :{" "}
                {money(
                  Math.abs(Number(receipt.balanceAfter)),
                  receipt.currency,
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {receipt.status === "cancelled" ? (
                <StatusBadge tone="danger">{tf("cancelled")}</StatusBadge>
              ) : (
                !readOnly && (
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() => setCancelling(receipt)}
                  >
                    {tf("cancelReceipt")}
                  </Button>
                )
              )}
              {receipt.pdfUrl ? (
                <Button
                  variant="secondary"
                  disabled={Boolean(downloading)}
                  busy={downloading === receipt.id}
                  onClick={() => void download(receipt)}
                >
                  <Download size={14} aria-hidden="true" />
                  {t("receipts.download")}
                </Button>
              ) : (
                <span className="self-center text-sm text-muted">
                  {t("receipts.preparingPdf")}
                </span>
              )}
            </div>
          </div>
        ))}
        {!loading && !receiptsError && receipts.length === 0 && (
          <p className="text-sm text-muted">{t("receipts.empty")}</p>
        )}
      </section>
      {review && (
        <Dialog
          open
          title={tw("reviewReceipt")}
          onClose={() => {
            if (!busy) setReview(false);
          }}
          busy={busy}
          actions={
            <>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setReview(false)}
              >
                {tc("cancel")}
              </Button>
              <Button busy={busy} onClick={() => void createReceipt()}>
                {tc("confirm")}
              </Button>
            </>
          }
        >
          <p className="font-semibold">{agreement.buyerName}</p>
          <p className="mt-2 text-lg font-semibold tabular-nums">
            {money(form.amount)}
          </p>
          <p className="mt-1">{form.paymentDate}</p>
          <p className="mt-3 text-sm text-muted">{t("receipts.duplicate")}</p>
        </Dialog>
      )}
      {cancelling && (
        <FinancialCorrectionDialog
          entityId={cancelling.id}
          namespace="sale-receipt-cancel"
          title={tf("cancelReceipt")}
          description={`${cancelling.receiptNumber} · ${money(cancelling.amount, cancelling.currency)}`}
          currency={cancelling.currency}
          execute={(request, key) =>
            salesApi.cancelReceipt(cancelling.id, request.reason, key)
          }
          onClose={() => setCancelling(undefined)}
          onComplete={() => {
            setCancelling(undefined);
            setSuccess(true);
            setRevision((value) => value + 1);
            onChanged();
          }}
        />
      )}
    </Surface>
  );
}

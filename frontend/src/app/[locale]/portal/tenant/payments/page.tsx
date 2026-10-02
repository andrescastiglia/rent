"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { invoicesApi, paymentsApi } from "@/lib/api/payments";
import { paymentGatewayApi } from "@/lib/api/payment-gateway";
import type { Invoice, Payment, PaymentPreference } from "@/types/payment";
import {
  Button,
  Dialog,
  Pagination,
  StatePanel,
  StatusBadge,
} from "@/components/ui";
import { formatCalendarDate } from "@/lib/calendar-date";
import { formatMoneyByCode } from "@/lib/format-money";
import { useWorkflowMutation } from "@/hooks/useWorkflowMutation";

function outstanding(invoice: Invoice): number {
  if (invoice.balanceDue != null && Number.isFinite(invoice.balanceDue))
    return Math.max(0, invoice.balanceDue);
  return Math.max(
    0,
    (Math.round(invoice.total * 100) - Math.round(invoice.amountPaid * 100)) /
      100,
  );
}

function checkoutUrl(value: string): string {
  const url = new URL(value);
  const domains = [
    "mercadopago.com",
    "mercadopago.com.ar",
    "mercadopago.com.br",
  ];
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !domains.some(
      (domain) =>
        url.hostname === domain || url.hostname.endsWith(`.${domain}`),
    )
  )
    throw new Error("Invalid checkout destination");
  return url.href;
}

export default function TenantPaymentsPage() {
  const t = useTranslations("tenantPortal");
  const tc = useTranslations("common");
  const tp = useTranslations("payments");
  const locale = useLocale();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoicePage, setInvoicePage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [paymentTotal, setPaymentTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice>();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [preference, setPreference] = useState<PaymentPreference>();
  const checkout = useWorkflowMutation(async (invoiceId: string) => {
    const result = await paymentGatewayApi.createPreference(invoiceId);
    const initPoint = checkoutUrl(result.initPoint);
    setPreference({ ...result, initPoint });
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    Promise.all([
      invoicesApi.getAll({ page: invoicePage, limit: 20 }),
      paymentsApi.getAll({ page: paymentPage, limit: 20 }),
    ])
      .then(([invoiceResult, paymentResult]) => {
        if (cancelled) return;
        setInvoices(invoiceResult.data);
        setInvoiceTotal(invoiceResult.total);
        setPayments(paymentResult.data);
        setPaymentTotal(paymentResult.total);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [invoicePage, paymentPage, revision]);

  function review(invoice: Invoice) {
    if (checkout.pending || checkout.busy) return;
    checkout.reset();
    setPreference(undefined);
    setSelectedInvoice(invoice);
    setReviewOpen(true);
  }

  const money = (amount: number, currency: string) =>
    formatMoneyByCode(amount, currency, locale);
  let content;
  if (error) {
    content = (
      <StatePanel
        error
        title={t("readError")}
        action={
          <Button onClick={() => setRevision((value) => value + 1)}>
            {t("retry")}
          </Button>
        }
      />
    );
  } else if (loading) {
    content = <StatePanel busy title={tc("loading")} />;
  } else {
    content = (
      <>
        <section aria-labelledby="tenant-invoices-title" className="space-y-3">
          <h2 id="tenant-invoices-title" className="font-semibold">
            {t("invoiceHistory")}
          </h2>
          {invoices.length === 0 && <StatePanel title={t("noInvoices")} />}
          {invoices.map((invoice) => {
            const balance = outstanding(invoice);
            const payable =
              ["pending", "sent", "partial", "overdue"].includes(
                invoice.status,
              ) && balance > 0;
            return (
              <article
                key={invoice.id}
                className="ui-surface flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <h3 className="font-medium break-all">
                    {invoice.invoiceNumber}
                  </h3>
                  <p className="text-sm text-muted">
                    {t("date")}: {formatCalendarDate(invoice.dueDate, locale)}
                  </p>
                  <StatusBadge>
                    {t(`invoiceStatus.${invoice.status}`)}
                  </StatusBadge>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm text-muted">{t("pendingBalance")}</p>
                    <p className="font-semibold whitespace-nowrap">
                      {money(balance, invoice.currencyCode)}
                    </p>
                  </div>
                  {payable && (
                    <Button
                      disabled={checkout.busy || !!checkout.pending}
                      onClick={() => review(invoice)}
                      aria-label={`${t("pay")} ${invoice.invoiceNumber}`}
                    >
                      {t("pay")}
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
          <Pagination
            page={invoicePage}
            pageSize={20}
            total={invoiceTotal}
            onPageChange={setInvoicePage}
          />
        </section>
        <section
          aria-labelledby="tenant-payment-history-title"
          className="space-y-3"
        >
          <h2 id="tenant-payment-history-title" className="font-semibold">
            {t("recentPayments")}
          </h2>
          {payments.length === 0 && <StatePanel title={t("noPayments")} />}
          {payments.map((payment) => (
            <article
              key={payment.id}
              className="ui-surface flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="font-semibold whitespace-nowrap">
                  {money(payment.amount, payment.currencyCode)}
                </p>
                <p className="text-sm text-muted break-all">
                  {formatCalendarDate(payment.paymentDate, locale)}
                  {payment.reference && ` · ${payment.reference}`}
                </p>
              </div>
              <StatusBadge>{tp(`status.${payment.status}`)}</StatusBadge>
            </article>
          ))}
          <Pagination
            page={paymentPage}
            pageSize={20}
            total={paymentTotal}
            onPageChange={setPaymentPage}
          />
        </section>
      </>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">{t("myPayments")}</h1>
      {checkout.pending && !reviewOpen && (
        <StatePanel
          error
          title={t("checkout.uncertain")}
          action={
            <Button onClick={() => setReviewOpen(true)}>
              {t("checkout.recover")}
            </Button>
          }
        />
      )}
      {content}
      <Dialog
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title={t("checkout.review")}
        description={t("checkout.description")}
        busy={checkout.busy}
        actions={
          selectedInvoice &&
          !preference && (
            <Button
              disabled={checkout.busy}
              onClick={() => {
                void checkout.submit(selectedInvoice.id);
              }}
            >
              {checkout.pending ? t("checkout.recover") : t("checkout.confirm")}
            </Button>
          )
        }
      >
        {selectedInvoice && (
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-muted">{t("invoiceHistory")}</dt>
              <dd className="font-medium break-all">
                {selectedInvoice.invoiceNumber}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t("date")}</dt>
              <dd>{formatCalendarDate(selectedInvoice.dueDate, locale)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t("pendingBalance")}</dt>
              <dd className="font-semibold">
                {money(
                  outstanding(selectedInvoice),
                  selectedInvoice.currencyCode,
                )}{" "}
                · {selectedInvoice.currencyCode}
              </dd>
            </div>
          </dl>
        )}
        {checkout.error && (
          <StatePanel error title={t(`checkout.${checkout.error}`)} />
        )}
        {preference && (
          <div className="mt-4 space-y-3">
            <StatePanel title={t("checkout.ready")} />
            <a
              className="btn btn-primary inline-flex"
              href={preference.initPoint}
              rel="noreferrer"
            >
              {t("checkout.continue")}
            </a>
          </div>
        )}
      </Dialog>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { invoicesApi, paymentsApi } from "@/lib/api/payments";
import { Invoice, Payment, PaymentMethod } from "@/types/payment";
import { Plus, Loader2, X } from "lucide-react";

const PAYMENT_METHODS: PaymentMethod[] = [
  "cash",
  "bank_transfer",
  "credit_card",
  "debit_card",
  "check",
  "digital_wallet",
  "other",
];

export default function TenantPaymentsPage() {
  const t = useTranslations("tenantPortal");
  const locale = useLocale();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tenantAccountId, setTenantAccountId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    amount: "",
    date: new Date().toISOString().split("T")[0],
    method: "bank_transfer" as PaymentMethod,
    reference: "",
  });

  const loadData = async () => {
    try {
      const [invoicesRes, paymentsRes] = await Promise.all([
        invoicesApi.getAll({}),
        paymentsApi.getAll({}),
      ]);
      setInvoices(invoicesRes.data);
      setPayments(paymentsRes.data);
      // Derive tenant account ID from loaded data
      const accountId =
        invoicesRes.data[0]?.tenantAccountId ??
        paymentsRes.data[0]?.tenantAccountId ??
        "";
      setTenantAccountId(accountId);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString(
      locale === "en" ? "en-US" : locale === "pt" ? "pt-BR" : "es-AR",
    );
  };

  const formatCurrency = (amount: number, currency = "ARS") =>
    new Intl.NumberFormat(
      locale === "en" ? "en-US" : locale === "pt" ? "pt-BR" : "es-AR",
      { style: "currency", currency },
    ).format(amount);

  const getInvoiceStatusClass = (status: Invoice["status"]) => {
    switch (status) {
      case "paid":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "overdue":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      case "pending":
      case "sent":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      default:
        return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await paymentsApi.create({
        tenantAccountId,
        amount: parseFloat(form.amount),
        paymentDate: form.date,
        method: form.method,
        reference: form.reference || undefined,
        currencyCode: "ARS",
      });
      setShowModal(false);
      setForm({
        amount: "",
        date: new Date().toISOString().split("T")[0],
        method: "bank_transfer",
        reference: "",
      });
      void loadData();
    } catch {
      // fail silently
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {t("myPayments")}
        </h1>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("registerPayment")}
        </button>
      </div>

      {/* Invoices */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          {t("invoiceHistory")}
        </h2>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700">
          {invoices.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center text-gray-400">
              {t("noInvoices")}
            </p>
          ) : (
            invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {invoice.invoiceNumber}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t("date")}: {formatDate(invoice.dueDate)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(invoice.total, invoice.currencyCode)}
                  </p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${getInvoiceStatusClass(invoice.status)}`}
                  >
                    {t(
                      `invoiceStatus.${invoice.status}` as Parameters<
                        typeof t
                      >[0],
                    )}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Payment history */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          {t("recentPayments")}
        </h2>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700">
          {payments.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center text-gray-400">
              {t("noPayments")}
            </p>
          ) : (
            payments.map((payment) => (
              <div
                key={payment.id}
                className="px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {formatCurrency(payment.amount, payment.currencyCode)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(payment.paymentDate)}
                    {payment.reference ? ` · ${payment.reference}` : ""}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    payment.status === "completed"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                  }`}
                >
                  {payment.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Manual payment modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {t("registerPayment")}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("amount")}
                </label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("date")}
                </label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, date: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("method")}
                </label>
                <select
                  value={form.method}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      method: e.target.value as PaymentMethod,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t(`paymentMethods.${m}` as Parameters<typeof t>[0])}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("reference")}
                </label>
                <input
                  type="text"
                  value={form.reference}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, reference: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {t("submitRequest")}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Loader2, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { IS_MOCK_MODE } from "@/lib/api";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { tenantsApi } from "@/lib/api/tenants";
import { CurrencySelect } from "@/components/common/CurrencySelect";
import { Lease } from "@/types/lease";
import { Tenant } from "@/types/tenant";
import {
  AccountBalance,
  Invoice,
  PaymentMethod,
  TenantAccount,
  TenantAccountMovement,
} from "@/types/payment";
import { invoicesApi, paymentsApi, tenantAccountsApi } from "@/lib/api/payments";

const OPEN_INVOICE_STATUSES = new Set<Invoice["status"]>([
  "pending",
  "sent",
  "partial",
  "overdue",
]);

const getInvoicePendingAmount = (invoice: Invoice): number => {
  const total = Number(invoice.total ?? 0);
  const amountPaid = Number(invoice.amountPaid ?? 0);
  return Math.max(0, total - amountPaid);
};

export default function TenantPaymentRegistrationPage() {
  const { loading: authLoading, token } = useAuth();
  const t = useTranslations("tenants");
  const tPayments = useTranslations("payments");
  const tCommon = useTranslations("common");
  const tCurrencies = useTranslations("currencies");
  const locale = useLocale();
  const router = useLocalizedRouter();
  const params = useParams();
  const tenantId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [tenantAccount, setTenantAccount] = useState<TenantAccount | null>(null);
  const [accountBalance, setAccountBalance] = useState<AccountBalance | null>(null);
  const [movements, setMovements] = useState<TenantAccountMovement[]>([]);
  const [openInvoices, setOpenInvoices] = useState<Invoice[]>([]);
  const [registeringPayment, setRegisteringPayment] = useState(false);
  const [loading, setLoading] = useState(true);

  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    currencyCode: "ARS",
    paymentDate: new Date().toISOString().split("T")[0],
    method: "bank_transfer" as PaymentMethod,
    reference: "",
    notes: "",
  });

  const activeLease = useMemo(
    () => leases.find((lease) => lease.status === "ACTIVE") ?? leases[0] ?? null,
    [leases],
  );

  const tenantName = `${tenant?.firstName ?? ""} ${tenant?.lastName ?? ""}`.trim();
  const propertyName = activeLease?.property?.name ?? "-";

  const paymentMethods: PaymentMethod[] = [
    "cash",
    "bank_transfer",
    "check",
    "debit_card",
    "credit_card",
    "digital_wallet",
    "crypto",
    "other",
  ];

  const loadData = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const normalizedId = typeof id === "string" ? id : String(id);
        let data: Tenant | null = null;

        try {
          data = await tenantsApi.getById(normalizedId);
        } catch (error) {
          console.warn("Failed to load tenant by id", error);
        }

        if (!data) {
          try {
            const fallbackTenants = await tenantsApi.getAll();
            data = fallbackTenants[0] ?? null;
          } catch (error) {
            console.warn("Failed to load fallback tenants", error);
          }
        }

        const allowMockFallback =
          IS_MOCK_MODE ||
          (token?.startsWith("mock-token-") ?? false) ||
          process.env.NEXT_PUBLIC_MOCK_MODE === "true";

        if (!data && allowMockFallback) {
          data = {
            id: normalizedId || "1",
            firstName: "Inquilino",
            lastName: "Demo",
            email: "demo@example.com",
            phone: "",
            dni: normalizedId || "1",
            status: "ACTIVE",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }

        if (!data) {
          setTenant(null);
          setLeases([]);
          setTenantAccount(null);
          setAccountBalance(null);
          setMovements([]);
          setOpenInvoices([]);
          return;
        }

        const leaseHistory = await tenantsApi.getLeaseHistory(data.id).catch(() => []);
        const currentLease =
          leaseHistory.find((lease) => lease.status === "ACTIVE") ?? leaseHistory[0] ?? null;

        let account: TenantAccount | null = null;
        let nextBalance: AccountBalance | null = null;
        let nextMovements: TenantAccountMovement[] = [];
        let nextOpenInvoices: Invoice[] = [];

        if (currentLease) {
          account = await tenantAccountsApi.getByLease(currentLease.id);

          const invoicesResult = await invoicesApi
            .getAll({ leaseId: currentLease.id, limit: 100 })
            .catch(() => ({ data: [] as Invoice[] }));

          nextOpenInvoices = invoicesResult.data
            .filter(
              (invoice) =>
                OPEN_INVOICE_STATUSES.has(invoice.status) &&
                getInvoicePendingAmount(invoice) > 0,
            )
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

          if (account) {
            const [balanceResult, movementsResult] = await Promise.allSettled([
              tenantAccountsApi.getBalance(account.id),
              tenantAccountsApi.getMovements(account.id),
            ]);
            nextBalance = balanceResult.status === "fulfilled" ? balanceResult.value : null;
            nextMovements = movementsResult.status === "fulfilled" ? movementsResult.value : [];
          }
        }

        setTenant(data);
        setLeases(leaseHistory);
        setTenantAccount(account);
        setAccountBalance(nextBalance);
        setMovements(nextMovements);
        setOpenInvoices(nextOpenInvoices);
      } catch (error) {
        console.error("Failed to load tenant payment registration data", error);
        setTenant(null);
        setLeases([]);
        setTenantAccount(null);
        setAccountBalance(null);
        setMovements([]);
        setOpenInvoices([]);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!tenantId) return;
    void loadData(tenantId);
  }, [authLoading, tenantId, loadData]);

  const handleRegisterPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenantAccount || !tenant) return;

    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert(t("errors.invalidPaymentAmount"));
      return;
    }

    try {
      setRegisteringPayment(true);
      const created = await paymentsApi.create({
        tenantAccountId: tenantAccount.id,
        amount,
        currencyCode: paymentForm.currencyCode,
        paymentDate: paymentForm.paymentDate,
        method: paymentForm.method,
        reference: paymentForm.reference || undefined,
        notes: paymentForm.notes || undefined,
      });

      await paymentsApi.confirm(created.id);
      router.push(`/tenants/${tenant.id}`);
      router.refresh();
    } catch (error) {
      console.error("Failed to register rent payment", error);
      alert(tCommon("error"));
    } finally {
      setRegisteringPayment(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("notFound")}</h1>
        <Link
          href={`/${locale}/tenants`}
          className="text-blue-600 hover:underline mt-4 inline-block"
        >
          {t("backToList")}
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/${locale}/tenants/${tenant.id}`}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft size={16} className="mr-1" />
          {t("backToDetails")}
        </Link>
      </div>

      <div className="mb-6 space-y-1">
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{tenantName || "-"}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{propertyName}</p>
      </div>

      {tenantAccount ? (
        <div className="space-y-4 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-md bg-gray-50 dark:bg-gray-700 p-3 border border-gray-100 dark:border-gray-600">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("paymentRegistration.balance")}</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {(accountBalance?.balance ?? 0).toLocaleString(locale)}
              </p>
            </div>
            <div className="rounded-md bg-gray-50 dark:bg-gray-700 p-3 border border-gray-100 dark:border-gray-600">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("paymentRegistration.lateFee")}</p>
              <p className="font-semibold text-amber-700 dark:text-amber-300">
                {(accountBalance?.lateFee ?? 0).toLocaleString(locale)}
              </p>
            </div>
            <div className="rounded-md bg-gray-50 dark:bg-gray-700 p-3 border border-gray-100 dark:border-gray-600">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("paymentRegistration.totalDebt")}</p>
              <p className="font-semibold text-red-700 dark:text-red-300">
                {(accountBalance?.total ?? 0).toLocaleString(locale)}
              </p>
            </div>
          </div>

          <form onSubmit={handleRegisterPayment} className="space-y-3">
            <div className="rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 p-3 space-y-2">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {t("paymentRegistration.pendingInvoices")}
              </p>
              {openInvoices.length > 0 ? (
                <div className="space-y-2 max-h-40 overflow-auto">
                  {openInvoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between text-xs rounded-sm border border-gray-100 dark:border-gray-600 px-2 py-1 bg-white dark:bg-gray-800"
                    >
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{invoice.invoiceNumber}</p>
                        <p className="text-gray-500 dark:text-gray-400">
                          {tPayments("date")}: {new Date(invoice.dueDate).toLocaleDateString(locale)} · {" "}
                          {tPayments(`status.${invoice.status}`)}
                        </p>
                      </div>
                      <p className="font-semibold text-red-700 dark:text-red-300">
                        {invoice.currencyCode} {getInvoicePendingAmount(invoice).toLocaleString(locale)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("paymentRegistration.noPendingInvoices")}
                </p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("paymentRegistration.fifoHint")}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={paymentForm.amount}
                placeholder={t("paymentRegistration.amount")}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    amount: e.target.value,
                  }))
                }
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm"
              />
              <input
                type="date"
                required
                value={paymentForm.paymentDate}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    paymentDate: e.target.value,
                  }))
                }
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm"
              />
              <select
                value={paymentForm.method}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    method: e.target.value as PaymentMethod,
                  }))
                }
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm"
              >
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {t(`paymentRegistration.methods.${method}`)}
                  </option>
                ))}
              </select>
              <div className="space-y-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {tCurrencies("title")}
                </p>
                <CurrencySelect
                  id="tenantPaymentCurrencyCode"
                  name="tenantPaymentCurrencyCode"
                  value={paymentForm.currencyCode}
                  onChange={(value) =>
                    setPaymentForm((prev) => ({
                      ...prev,
                      currencyCode: value,
                    }))
                  }
                  className="text-sm"
                />
              </div>
              <input
                type="text"
                value={paymentForm.reference}
                placeholder={t("paymentRegistration.reference")}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    reference: e.target.value,
                  }))
                }
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm"
              />
            </div>

            <textarea
              rows={2}
              value={paymentForm.notes}
              placeholder={t("paymentRegistration.notes")}
              onChange={(e) =>
                setPaymentForm((prev) => ({
                  ...prev,
                  notes: e.target.value,
                }))
              }
              className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm"
            />

            <button type="submit" disabled={registeringPayment} className="btn btn-primary w-full">
              <Wallet size={16} className="mr-2" />
              {registeringPayment ? tCommon("saving") : t("paymentRegistration.submit")}
            </button>
          </form>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-900 dark:text-white">{t("paymentRegistration.movements")}</p>
            {movements.length > 0 ? (
              <div className="space-y-2 max-h-52 overflow-auto">
                {movements.map((movement) => (
                  <div
                    key={movement.id}
                    className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-700 rounded-md border border-gray-100 dark:border-gray-600 p-2"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{movement.description}</p>
                      <p className="text-gray-500 dark:text-gray-400">
                        {new Date(movement.movementDate).toLocaleDateString(locale)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={
                          movement.amount <= 0
                            ? "font-semibold text-green-700 dark:text-green-300"
                            : "font-semibold text-red-700 dark:text-red-300"
                        }
                      >
                        {movement.amount.toLocaleString(locale)}
                      </p>
                      <p className="text-gray-500 dark:text-gray-400">
                        {t("paymentRegistration.balanceAfter")}: {movement.balanceAfter.toLocaleString(locale)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t("paymentRegistration.noMovements")}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-sm text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
          {t("paymentRegistration.noAccount")}
        </div>
      )}
    </div>
  );
}

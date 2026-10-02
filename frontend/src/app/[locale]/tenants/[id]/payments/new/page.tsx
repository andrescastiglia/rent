"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Loader2, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Button, StatePanel } from "@/components/ui";
import { canUserAccessModule } from "@/lib/permissions";
import { useWorkflowMutation } from "@/hooks/useWorkflowMutation";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { tenantsApi } from "@/lib/api/tenants";
import { CurrencySelect } from "@/components/common/CurrencySelect";
import { Lease } from "@/types/lease";
import { Tenant } from "@/types/tenant";
import {
  AccountBalance,
  CreatePaymentInput,
  Invoice,
  PaymentActivityType,
  PaymentMethod,
  TenantAccount,
  TenantAccountMovement,
} from "@/types/payment";
import {
  invoicesApi,
  paymentsApi,
  tenantAccountsApi,
} from "@/lib/api/payments";
import { encodeRouteSegment } from "@/lib/safe-url";
import { collectPages } from "@/lib/pagination";

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

async function loadLeaseFinancialData(leaseId: string) {
  const account = await tenantAccountsApi.getByLease(leaseId);

  const invoiceRows = await collectPages((page) =>
    invoicesApi.getAll({ leaseId, page, limit: 100 }),
  );

  const openInvoices = invoiceRows
    .filter(
      (invoice) =>
        OPEN_INVOICE_STATUSES.has(invoice.status) &&
        getInvoicePendingAmount(invoice) > 0,
    )
    .sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );

  let balance: AccountBalance | null = null;
  let movements: TenantAccountMovement[] = [];

  if (account) {
    const [balanceResult, movementsResult] = await Promise.all([
      tenantAccountsApi.getBalance(account.id),
      tenantAccountsApi.getMovements(account.id),
    ]);
    balance = balanceResult;
    movements = movementsResult;
  }

  return { account, balance, movements, openInvoices };
}

export default function TenantPaymentRegistrationPage() {
  const { user, loading } = useAuth();
  const params = useParams();
  const tw = useTranslations("paymentWorkflow");
  if (loading) return <StatePanel busy title={tw("review")} />;
  if (!user || !canUserAccessModule(user, ["admin", "staff"], "payments"))
    return <StatePanel title={tw("unavailable")} />;
  return (
    <TenantPaymentContent key={`${user.companyId}:${user.id}:${params.id}`} />
  );
}

function TenantPaymentContent() {
  const { loading: authLoading } = useAuth();
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
  const [tenantAccount, setTenantAccount] = useState<TenantAccount | null>(
    null,
  );
  const [accountBalance, setAccountBalance] = useState<AccountBalance | null>(
    null,
  );
  const [movements, setMovements] = useState<TenantAccountMovement[]>([]);
  const [openInvoices, setOpenInvoices] = useState<Invoice[]>([]);
  const tw = useTranslations("paymentWorkflow");
  const [readError, setReadError] = useState(false);
  const [validationError, setValidationError] = useState(false);
  const mutation = useWorkflowMutation<CreatePaymentInput>(async (request) => {
    const created = await paymentsApi.create(request);
    router.push(`/payments/${encodeRouteSegment(created.id)}`);
  });
  const registeringPayment = mutation.busy;
  const [loading, setLoading] = useState(true);

  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    currencyCode: "ARS",
    paymentDate: new Date().toISOString().split("T")[0],
    method: "bank_transfer" as PaymentMethod,
    activityType: "monthly" as PaymentActivityType,
    reference: "",
    notes: "",
  });

  const activeLease = useMemo(
    () => leases.find((lease) => lease.status === "ACTIVE") ?? null,
    [leases],
  );

  const tenantName =
    `${tenant?.firstName ?? ""} ${tenant?.lastName ?? ""}`.trim();
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

  const loadData = useCallback(async (id: string) => {
    setLoading(true);
    try {
      setReadError(false);
      const data = await tenantsApi.getById(id);

      if (!data) {
        setTenant(null);
        setLeases([]);
        setTenantAccount(null);
        setAccountBalance(null);
        setMovements([]);
        setOpenInvoices([]);
        return;
      }

      const leaseHistory = await tenantsApi.getLeaseHistory(data.id);
      const currentLease =
        leaseHistory.find((lease) => lease.status === "ACTIVE") ?? null;

      const financial = currentLease
        ? await loadLeaseFinancialData(currentLease.id)
        : { account: null, balance: null, movements: [], openInvoices: [] };

      setTenant(data);
      setLeases(leaseHistory);
      setTenantAccount(financial.account);
      setAccountBalance(financial.balance);
      setMovements(financial.movements);
      setOpenInvoices(financial.openInvoices);
      setPaymentForm((prev) => ({
        ...prev,
        currencyCode: currentLease?.currency ?? "ARS",
      }));
    } catch {
      setReadError(true);
      setTenant(null);
      setLeases([]);
      setTenantAccount(null);
      setAccountBalance(null);
      setMovements([]);
      setOpenInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!tenantId) {
      setLoading(false);
      return;
    }
    void loadData(tenantId);
  }, [authLoading, tenantId, loadData]);

  const handleRegisterPayment = async (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (!tenantAccount || !tenant) return;
    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setValidationError(true);
      return;
    }
    setValidationError(false);
    await mutation.submit({
      tenantAccountId: tenantAccount.id,
      amount,
      currencyCode: paymentForm.currencyCode,
      paymentDate: paymentForm.paymentDate,
      method: paymentForm.method,
      activityType: paymentForm.activityType,
      reference: paymentForm.reference || undefined,
      notes: paymentForm.notes || undefined,
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (readError)
    return (
      <StatePanel
        error
        title={tw("readError")}
        action={
          <Button onClick={() => tenantId && void loadData(tenantId)}>
            {tw("retry")}
          </Button>
        }
      />
    );

  if (!tenant) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("notFound")}
        </h1>
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
          href={`/${locale}/tenants/${encodeRouteSegment(tenant.id)}`}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft size={16} className="mr-1" />
          {t("backToDetails")}
        </Link>
      </div>

      <div className="mb-6 space-y-1">
        <p className="text-2xl font-bold text-gray-900 dark:text-white">
          {tenantName || "-"}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {propertyName}
        </p>
      </div>

      {validationError && (
        <StatePanel error title={t("errors.invalidPaymentAmount")} />
      )}
      {mutation.error && (
        <StatePanel
          error
          title={tw(mutation.error)}
          action={
            mutation.pending ? (
              <Button
                disabled={mutation.busy}
                onClick={() => void mutation.submit(mutation.pending!)}
              >
                {tw("recover")}
              </Button>
            ) : undefined
          }
        />
      )}
      {tenantAccount ? (
        <div className="space-y-4 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-md bg-gray-50 dark:bg-gray-700 p-3 border border-gray-100 dark:border-gray-600">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("paymentRegistration.balance")}
              </p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {(accountBalance?.balance ?? 0).toLocaleString(locale)}
              </p>
            </div>
            <div className="rounded-md bg-gray-50 dark:bg-gray-700 p-3 border border-gray-100 dark:border-gray-600">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("paymentRegistration.lateFee")}
              </p>
              <p className="font-semibold text-amber-700 dark:text-amber-300">
                {(accountBalance?.lateFee ?? 0).toLocaleString(locale)}
              </p>
            </div>
            <div className="rounded-md bg-gray-50 dark:bg-gray-700 p-3 border border-gray-100 dark:border-gray-600">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("paymentRegistration.totalDebt")}
              </p>
              <p className="font-semibold text-red-700 dark:text-red-300">
                {(accountBalance?.total ?? 0).toLocaleString(locale)}
              </p>
            </div>
          </div>

          <form onSubmit={handleRegisterPayment} className="space-y-3">
            <fieldset
              className="space-y-3"
              disabled={mutation.busy || Boolean(mutation.pending)}
            >
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
                          <p className="font-medium text-gray-900 dark:text-white">
                            {invoice.invoiceNumber}
                          </p>
                          <p className="text-gray-500 dark:text-gray-400">
                            {tPayments("date")}:{" "}
                            {new Date(invoice.dueDate).toLocaleDateString(
                              locale,
                            )}{" "}
                            · {tPayments(`status.${invoice.status}`)}
                          </p>
                        </div>
                        <p className="font-semibold text-red-700 dark:text-red-300">
                          {invoice.currencyCode}{" "}
                          {getInvoicePendingAmount(invoice).toLocaleString(
                            locale,
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t("paymentRegistration.noPendingInvoices")}
                  </p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("paymentRegistration.fifoHint")}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  aria-label={t("paymentRegistration.amount")}
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
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm"
                />
                <input
                  aria-label={tPayments("date")}
                  type="date"
                  required
                  value={paymentForm.paymentDate}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({
                      ...prev,
                      paymentDate: e.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm"
                />
                <select
                  aria-label={tPayments("method.label")}
                  value={paymentForm.method}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({
                      ...prev,
                      method: e.target.value as PaymentMethod,
                    }))
                  }
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm"
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
                  aria-label={t("paymentRegistration.reference")}
                  type="text"
                  value={paymentForm.reference}
                  placeholder={t("paymentRegistration.reference")}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({
                      ...prev,
                      reference: e.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm"
                />
              </div>

              <textarea
                aria-label={t("paymentRegistration.notes")}
                rows={2}
                value={paymentForm.notes}
                placeholder={t("paymentRegistration.notes")}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    notes: e.target.value,
                  }))
                }
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm"
              />

              <button
                type="submit"
                disabled={registeringPayment}
                className="btn btn-primary w-full"
              >
                <Wallet size={16} className="mr-2" />
                {registeringPayment
                  ? tCommon("saving")
                  : tPayments("savePayment")}
              </button>
            </fieldset>
          </form>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {t("paymentRegistration.movements")}
            </p>
            {movements.length > 0 ? (
              <div className="space-y-2 max-h-52 overflow-auto">
                {movements.map((movement) => (
                  <div
                    key={movement.id}
                    className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-700 rounded-md border border-gray-100 dark:border-gray-600 p-2"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {movement.description}
                      </p>
                      <p className="text-gray-500 dark:text-gray-400">
                        {new Date(movement.movementDate).toLocaleDateString(
                          locale,
                        )}
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
                        {t("paymentRegistration.balanceAfter")}:{" "}
                        {movement.balanceAfter.toLocaleString(locale)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t("paymentRegistration.noMovements")}
              </p>
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

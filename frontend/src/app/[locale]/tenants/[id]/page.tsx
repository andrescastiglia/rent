"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Tenant, TenantActivity } from "@/types/tenant";
import { tenantsApi } from "@/lib/api/tenants";
import {
  invoicesApi,
  paymentsApi,
  tenantAccountsApi,
} from "@/lib/api/payments";
import {
  Edit,
  ArrowLeft,
  User,
  Mail,
  Phone,
  MapPin,
  Loader2,
  FileText,
  Download,
  Wallet,
  CheckCircle2,
  Eye,
  Plus,
} from "lucide-react";
import { Lease } from "@/types/lease";
import {
  AccountBalance,
  Invoice,
  Payment,
  TenantAccount,
  TenantAccountMovement,
  TenantReceiptSummary,
} from "@/types/payment";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { IS_MOCK_MODE } from "@/lib/api";

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

export default function TenantDetailPage() {
  const { loading: authLoading, token } = useAuth();
  const t = useTranslations("tenants");
  const tPayments = useTranslations("payments");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const params = useParams();
  const tenantId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoicesById, setInvoicesById] = useState<Record<string, Invoice>>({});
  const [activities, setActivities] = useState<TenantActivity[]>([]);
  const [receipts, setReceipts] = useState<TenantReceiptSummary[]>([]);
  const [tenantAccount, setTenantAccount] = useState<TenantAccount | null>(
    null,
  );
  const [accountBalance, setAccountBalance] = useState<AccountBalance | null>(
    null,
  );
  const [movements, setMovements] = useState<TenantAccountMovement[]>([]);
  const [downloadingReceiptPaymentId, setDownloadingReceiptPaymentId] =
    useState<string | null>(null);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<
    string | null
  >(null);
  const [completingActivityId, setCompletingActivityId] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(true);

  const loadTenant = useCallback(
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
          IS_MOCK_MODE || (token?.startsWith("mock-token-") ?? false);
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
          setPayments([]);
          setInvoicesById({});
          setActivities([]);
          setReceipts([]);
          setTenantAccount(null);
          setAccountBalance(null);
          setMovements([]);
          return;
        }

        const [
          leaseHistoryResult,
          receiptHistoryResult,
          paymentsResult,
          activitiesResult,
        ] = await Promise.allSettled([
          tenantsApi.getLeaseHistory(data.id),
          tenantAccountsApi.getReceiptsByTenant(data.id),
          paymentsApi.getAll({ tenantId: data.id, limit: 100 }),
          tenantsApi.getActivities(data.id),
        ]);

        const leaseHistory =
          leaseHistoryResult.status === "fulfilled"
            ? leaseHistoryResult.value
            : [];

        const invoicesByLease = await Promise.allSettled(
          leaseHistory.map((lease) =>
            invoicesApi.getAll({ leaseId: lease.id, limit: 100 }),
          ),
        );

        const nextInvoicesById: Record<string, Invoice> = {};
        for (const result of invoicesByLease) {
          if (result.status !== "fulfilled") continue;
          for (const invoice of result.value.data) {
            nextInvoicesById[invoice.id] = invoice;
          }
        }

        setTenant(data);
        setLeases(leaseHistory);
        setInvoicesById(nextInvoicesById);
        setReceipts(
          receiptHistoryResult.status === "fulfilled"
            ? receiptHistoryResult.value
            : [],
        );
        setPayments(
          paymentsByDateDesc(
            paymentsResult.status === "fulfilled"
              ? paymentsResult.value.data
              : [],
          ),
        );
        setActivities(
          activitiesResult.status === "fulfilled"
            ? activitiesByDateDesc(activitiesResult.value)
            : [],
        );
      } catch (error) {
        console.error("Failed to load tenant", error);
        setTenant(null);
        setLeases([]);
        setPayments([]);
        setInvoicesById({});
        setActivities([]);
        setReceipts([]);
        setTenantAccount(null);
        setAccountBalance(null);
        setMovements([]);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  const loadAccountData = useCallback(async (leaseId: string) => {
    try {
      const account = await tenantAccountsApi.getByLease(leaseId);
      setTenantAccount(account);

      if (!account) {
        setAccountBalance(null);
        setMovements([]);
        return;
      }

      const [balanceResult, movementsResult] = await Promise.allSettled([
        tenantAccountsApi.getBalance(account.id),
        tenantAccountsApi.getMovements(account.id),
      ]);
      setAccountBalance(
        balanceResult.status === "fulfilled" ? balanceResult.value : null,
      );
      setMovements(
        movementsResult.status === "fulfilled" ? movementsResult.value : [],
      );
    } catch (error) {
      console.error("Failed to load tenant account data", error);
      setTenantAccount(null);
      setAccountBalance(null);
      setMovements([]);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (tenantId) {
      loadTenant(tenantId);
    }
  }, [tenantId, authLoading, loadTenant]);

  useEffect(() => {
    const activeLease =
      leases.find((lease) => lease.status === "ACTIVE") ?? leases[0];
    if (!activeLease) {
      setTenantAccount(null);
      setAccountBalance(null);
      setMovements([]);
      return;
    }
    void loadAccountData(activeLease.id);
  }, [leases, loadAccountData]);

  const getStatusLabel = (status: string) => {
    const statusKey = status.toLowerCase() as "active" | "inactive" | "pending";
    return t(`status.${statusKey}`);
  };

  const allowMockFallback =
    IS_MOCK_MODE ||
    (token?.startsWith("mock-token-") ?? false) ||
    process.env.NEXT_PUBLIC_MOCK_MODE === "true";

  const fallbackTenant: Tenant | null = allowMockFallback
    ? {
        id: tenantId ?? "1",
        firstName: "Inquilino",
        lastName: "Demo",
        email: "demo@example.com",
        phone: "",
        dni: tenantId ?? "1",
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    : null;

  const tenantToRender = tenant ?? fallbackTenant;

  const fallbackReceipts: TenantReceiptSummary[] = allowMockFallback
    ? [
        {
          id: "rec1",
          paymentId: "pay1",
          receiptNumber: "REC-202411-0001",
          amount: 1500,
          currencyCode: "ARS",
          issuedAt: "2024-11-15T14:30:00Z",
          paymentDate: "2024-11-15",
          pdfUrl: "/receipts/rec1.pdf",
        },
      ]
    : [];

  const receiptsToRender = [
    ...(receipts.length > 0 ? receipts : fallbackReceipts),
  ].sort(
    (a, b) =>
      new Date(b.paymentDate ?? b.issuedAt).getTime() -
      new Date(a.paymentDate ?? a.issuedAt).getTime(),
  );
  const activeLease =
    leases.find((lease) => lease.status === "ACTIVE") ?? leases[0];
  const openInvoices = useMemo(
    () =>
      Object.values(invoicesById)
        .filter(
          (invoice) =>
            invoice.leaseId === activeLease?.id &&
            OPEN_INVOICE_STATUSES.has(invoice.status) &&
            getInvoicePendingAmount(invoice) > 0,
        )
        .sort(
          (a, b) =>
            new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
        ),
    [activeLease?.id, invoicesById],
  );
  const handleDownloadReceipt = async (
    paymentId: string,
    receiptNumber?: string,
  ) => {
    try {
      setDownloadingReceiptPaymentId(paymentId);
      await paymentsApi.downloadReceiptPdf(paymentId, receiptNumber);
    } catch (error) {
      console.error("Failed to download receipt", error);
      alert(tCommon("error"));
    } finally {
      setDownloadingReceiptPaymentId(null);
    }
  };

  const handleDownloadInvoice = async (invoice: Invoice) => {
    try {
      setDownloadingInvoiceId(invoice.id);
      const isDebitNote =
        invoice.arcaTipoComprobante?.startsWith("nota_debito_") ?? false;
      await invoicesApi.downloadPdf(
        invoice.id,
        invoice.invoiceNumber,
        isDebitNote ? "nota-debito" : "factura",
      );
    } catch (error) {
      console.error("Failed to download invoice PDF", error);
      alert(tCommon("error"));
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  const handleCompleteActivity = async (activity: TenantActivity) => {
    if (!tenantToRender) return;
    try {
      setCompletingActivityId(activity.id);
      const updated = await tenantsApi.updateActivity(
        tenantToRender.id,
        activity.id,
        {
          status: "completed",
          completedAt: new Date().toISOString(),
        },
      );
      setActivities((prev) =>
        activitiesByDateDesc(
          prev.map((item) => (item.id === updated.id ? updated : item)),
        ),
      );
    } catch (error) {
      console.error("Failed to complete tenant activity", error);
      alert(tCommon("error"));
    } finally {
      setCompletingActivityId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (!tenantToRender) {
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
          href={`/${locale}/tenants`}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft size={16} className="mr-1" />
          {t("backToList")}
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xs border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8 border-b dark:border-gray-700 pb-6">
            <div className="flex items-center">
              <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-300 mr-6">
                <User size={40} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    {tenantToRender.firstName} {tenantToRender.lastName}
                  </h1>
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold uppercase tracking-wide ${
                      tenantToRender.status === "ACTIVE"
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                        : tenantToRender.status === "INACTIVE"
                          ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
                          : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
                    }`}
                  >
                    {getStatusLabel(tenantToRender.status)}
                  </span>
                </div>
                <p className="text-gray-500 dark:text-gray-400">
                  {tCommon("id")}: {tenantToRender.dni}
                </p>
              </div>
            </div>
            <div className="flex space-x-2">
              {tenantAccount && (
                <Link
                  href={`/${locale}/tenants/${tenantToRender.id}/payments/new`}
                  className="btn btn-success"
                >
                  <Wallet size={16} className="mr-2" />
                  {t("paymentRegistration.submit")}
                </Link>
              )}
              <Link
                href={`/${locale}/tenants/${tenantToRender.id}/activities/new`}
                className="btn btn-primary"
              >
                <Plus size={16} className="mr-2" />
                {t("activities.add")}
              </Link>
              <Link
                href={`/${locale}/tenants/${tenantToRender.id}/edit`}
                className="btn btn-secondary"
              >
                <Edit size={16} className="mr-2" />
                {tCommon("edit")}
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <section>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  {t("contactInfo")}
                </h2>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-center">
                    <Mail size={18} className="text-gray-400 mr-3" />
                    <span className="text-gray-700 dark:text-gray-300">
                      {tenantToRender.email}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <Phone size={18} className="text-gray-400 mr-3" />
                    <span className="text-gray-700 dark:text-gray-300">
                      {tenantToRender.phone}
                    </span>
                  </div>
                </div>
              </section>

              {tenantToRender.address && (
                <section>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    {t("address")}
                  </h2>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 flex items-start">
                    <MapPin size={18} className="text-gray-400 mr-3 mt-1" />
                    <span className="text-gray-700 dark:text-gray-300">
                      {tenantToRender.address.street}{" "}
                      {tenantToRender.address.number}
                      <br />
                      {tenantToRender.address.city},{" "}
                      {tenantToRender.address.state}{" "}
                      {tenantToRender.address.zipCode}
                    </span>
                  </div>
                </section>
              )}
            </div>

            <div className="space-y-6">
              <section>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  {t("leaseHistory")}
                </h2>
                {activeLease ? (
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {t("leaseStart")}
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {activeLease.startDate
                          ? new Date(activeLease.startDate).toLocaleDateString()
                          : "-"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {t("leaseEnd")}
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {activeLease.endDate
                          ? new Date(activeLease.endDate).toLocaleDateString()
                          : "-"}
                      </span>
                    </div>
                    {activeLease.property?.name && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">
                          {t("leaseProperty")}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {activeLease.property.name}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">
                        {t("leaseStatus")}
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {t(
                          `leaseStatusLabels.${activeLease.status.toLowerCase()}`,
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400 italic border-2 border-dashed border-gray-200 dark:border-gray-600">
                    <FileText
                      size={32}
                      className="mx-auto mb-2 text-gray-400"
                    />
                    {t("noActiveLeases")}
                  </div>
                )}
              </section>

              <section id="payment-registration">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  {t("paymentRegistration.title")}
                </h2>
                {tenantAccount ? (
                  <div className="space-y-4 bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="rounded-md bg-white dark:bg-gray-800 p-3 border border-gray-100 dark:border-gray-600">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t("paymentRegistration.balance")}
                        </p>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {(accountBalance?.balance ?? 0).toLocaleString(
                            locale,
                          )}
                        </p>
                      </div>
                      <div className="rounded-md bg-white dark:bg-gray-800 p-3 border border-gray-100 dark:border-gray-600">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t("paymentRegistration.lateFee")}
                        </p>
                        <p className="font-semibold text-amber-700 dark:text-amber-300">
                          {(accountBalance?.lateFee ?? 0).toLocaleString(
                            locale,
                          )}
                        </p>
                      </div>
                      <div className="rounded-md bg-white dark:bg-gray-800 p-3 border border-gray-100 dark:border-gray-600">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t("paymentRegistration.totalDebt")}
                        </p>
                        <p className="font-semibold text-red-700 dark:text-red-300">
                          {(accountBalance?.total ?? 0).toLocaleString(locale)}
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Link
                        href={`/${locale}/tenants/${tenantToRender.id}/payments/new`}
                        className="btn btn-primary"
                      >
                        <Wallet size={16} className="mr-2" />
                        {t("paymentRegistration.submit")}
                      </Link>
                    </div>

                    <div className="rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-3 space-y-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {t("paymentRegistration.pendingInvoices")}
                      </p>
                      {openInvoices.length > 0 ? (
                        <div className="space-y-2 max-h-40 overflow-auto">
                          {openInvoices.map((invoice) => (
                            <div
                              key={invoice.id}
                              className="flex items-center justify-between text-xs rounded-sm border border-gray-100 dark:border-gray-700 px-2 py-1"
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
                                {getInvoicePendingAmount(
                                  invoice,
                                ).toLocaleString(locale)}
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

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {t("paymentRegistration.movements")}
                      </p>
                      {movements.length > 0 ? (
                        <div className="space-y-2 max-h-52 overflow-auto">
                          {movements.map((movement) => (
                            <div
                              key={movement.id}
                              className="flex items-center justify-between text-xs bg-white dark:bg-gray-800 rounded-md border border-gray-100 dark:border-gray-600 p-2"
                            >
                              <div>
                                <p className="font-medium text-gray-900 dark:text-white">
                                  {movement.description}
                                </p>
                                <p className="text-gray-500 dark:text-gray-400">
                                  {new Date(
                                    movement.movementDate,
                                  ).toLocaleDateString(locale)}
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
              </section>

              <section>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  {tPayments("title")}
                </h2>
                {payments.length > 0 ? (
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 space-y-3">
                    {payments.map((payment) => {
                      const linkedInvoice = payment.invoiceId
                        ? invoicesById[payment.invoiceId]
                        : undefined;
                      const isDebitNote =
                        linkedInvoice?.arcaTipoComprobante?.startsWith(
                          "nota_debito_",
                        ) ?? false;

                      return (
                        <div
                          key={payment.id}
                          className="rounded-md bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-600 p-3"
                        >
                          <div className="flex flex-col gap-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                  {payment.currencyCode}{" "}
                                  {Number(payment.amount).toLocaleString(
                                    locale,
                                  )}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {new Date(
                                    payment.paymentDate,
                                  ).toLocaleDateString(locale)}{" "}
                                  · {tPayments(`method.${payment.method}`)}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {tPayments("paymentStatus")}:{" "}
                                  {tPayments(`status.${payment.status}`)}
                                </p>
                                {payment.receipt?.receiptNumber && (
                                  <p className="text-xs font-medium text-green-700 dark:text-green-300">
                                    {payment.receipt.receiptNumber}
                                  </p>
                                )}
                              </div>
                              <Link
                                href={`/${locale}/payments/${payment.id}`}
                                className="action-link action-link-primary text-xs px-2 py-1"
                              >
                                <Eye size={12} />
                                {tCommon("view")}
                              </Link>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {linkedInvoice ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleDownloadInvoice(linkedInvoice)
                                  }
                                  disabled={
                                    downloadingInvoiceId === linkedInvoice.id
                                  }
                                  className="btn btn-primary btn-sm"
                                >
                                  <Download size={12} className="mr-1" />
                                  {downloadingInvoiceId === linkedInvoice.id
                                    ? tCommon("loading")
                                    : isDebitNote
                                      ? t("documents.downloadDebitNote")
                                      : t("documents.downloadInvoice")}
                                </button>
                              ) : null}

                              {payment.receipt ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDownloadReceipt(
                                      payment.id,
                                      payment.receipt?.receiptNumber,
                                    )
                                  }
                                  disabled={
                                    downloadingReceiptPaymentId === payment.id
                                  }
                                  className="btn btn-success btn-sm"
                                >
                                  <Download size={12} className="mr-1" />
                                  {downloadingReceiptPaymentId === payment.id
                                    ? tCommon("loading")
                                    : t("documents.downloadReceipt")}
                                </button>
                              ) : null}

                              {!linkedInvoice && !payment.receipt ? (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {t("documents.noDocuments")}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-sm text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
                    {tPayments("noPayments")}
                  </div>
                )}
              </section>

              <section id="activities">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {t("activities.title")}
                  </h2>
                  <Link
                    href={`/${locale}/tenants/${tenantToRender.id}/activities/new`}
                    className="btn btn-primary btn-sm"
                  >
                    <Plus size={12} className="mr-1" />
                    {t("activities.add")}
                  </Link>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 space-y-3">
                  <div className="space-y-2">
                    {activities.length > 0 ? (
                      activities.map((activity) => (
                        <div
                          key={activity.id}
                          className="rounded-md bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-600 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                {activity.subject}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {t(`activityTypes.${activity.type}`)} ·{" "}
                                {t(`activityStatus.${activity.status}`)}
                              </p>
                              {activity.dueAt ? (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {t("activities.dueAt")}:{" "}
                                  {new Date(activity.dueAt).toLocaleString(
                                    locale,
                                  )}
                                </p>
                              ) : null}
                              {activity.body ? (
                                <p className="text-xs text-gray-600 dark:text-gray-300">
                                  {activity.body}
                                </p>
                              ) : null}
                            </div>
                            {activity.status === "pending" ? (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleCompleteActivity(activity)
                                }
                                disabled={completingActivityId === activity.id}
                                className="btn btn-success btn-sm"
                              >
                                <CheckCircle2 size={12} className="mr-1" />
                                {completingActivityId === activity.id
                                  ? tCommon("loading")
                                  : t("activities.complete")}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t("activities.empty")}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  {t("receiptsHistory")}
                </h2>
                {receiptsToRender.length > 0 ? (
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 space-y-3">
                    {receiptsToRender.map((receipt) => (
                      <div
                        key={receipt.id}
                        className="flex items-center justify-between text-sm gap-3"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {receipt.receiptNumber}
                          </span>
                          <span className="text-gray-500 dark:text-gray-400">
                            {receipt.paymentDate
                              ? new Date(
                                  receipt.paymentDate,
                                ).toLocaleDateString()
                              : new Date(receipt.issuedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {receipt.currencyCode}{" "}
                            {receipt.amount.toLocaleString()}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleDownloadReceipt(
                                receipt.paymentId,
                                receipt.receiptNumber,
                              )
                            }
                            disabled={
                              downloadingReceiptPaymentId === receipt.paymentId
                            }
                            className="btn btn-success btn-sm"
                          >
                            <Download size={12} className="mr-1" />
                            {downloadingReceiptPaymentId === receipt.paymentId
                              ? tCommon("loading")
                              : tPayments("downloadReceipt")}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400 italic border-2 border-dashed border-gray-200 dark:border-gray-600">
                    <FileText
                      size={32}
                      className="mx-auto mb-2 text-gray-400"
                    />
                    {t("noReceipts")}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function paymentsByDateDesc(items: Payment[]): Payment[] {
  return [...items].sort(
    (a, b) =>
      new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime() ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function activitiesByDateDesc(items: TenantActivity[]): TenantActivity[] {
  return [...items].sort(
    (a, b) =>
      new Date(b.dueAt ?? b.createdAt).getTime() -
      new Date(a.dueAt ?? a.createdAt).getTime(),
  );
}

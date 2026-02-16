"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Tenant, TenantActivity } from "@/types/tenant";
import { tenantsApi } from "@/lib/api/tenants";
import { invoicesApi, paymentsApi } from "@/lib/api/payments";
import {
  ArrowLeft,
  User,
  Loader2,
  FileText,
  Download,
  Wallet,
  CheckCircle2,
  Eye,
  Plus,
  Edit,
} from "lucide-react";
import { Lease } from "@/types/lease";
import { Invoice, Payment } from "@/types/payment";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { IS_MOCK_MODE } from "@/lib/api";

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
          return;
        }

        const [leaseHistoryResult, paymentsResult, activitiesResult] =
          await Promise.allSettled([
            tenantsApi.getLeaseHistory(data.id),
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
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (authLoading) return;
    if (tenantId) {
      loadTenant(tenantId).catch((error) => {
        console.error("Failed to load tenant", error);
      });
    }
  }, [tenantId, authLoading, loadTenant]);

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
  const activeLease =
    leases.find((lease) => lease.status === "ACTIVE") ?? leases[0];
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
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/${locale}/tenants/${tenantToRender.id}/edit`}
                className="btn btn-secondary"
              >
                <Edit size={16} className="mr-2" />
                {tCommon("edit")}
              </Link>
              <Link
                href={`/${locale}/tenants/${tenantToRender.id}/payments/new`}
                className="btn btn-success"
              >
                <Wallet size={16} className="mr-2" />
                {t("paymentRegistration.submit")}
              </Link>
              <Link
                href={`/${locale}/tenants/${tenantToRender.id}/activities/new`}
                className="btn btn-primary"
              >
                <Plus size={16} className="mr-2" />
                {t("activities.add")}
              </Link>
            </div>
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
                  <FileText size={32} className="mx-auto mb-2 text-gray-400" />
                  {t("noActiveLeases")}
                </div>
              )}
            </section>

            <section id="activities">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {t("activities.title")}
              </h2>
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
                              onClick={() => {
                                handleCompleteActivity(activity).catch(
                                  (error) => {
                                    console.error(
                                      "Failed to complete tenant activity",
                                      error,
                                    );
                                  },
                                );
                              }}
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
                                {Number(payment.amount).toLocaleString(locale)}
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
                              {payment.receipt?.receiptNumber ? (
                                <p className="text-xs font-medium text-green-700 dark:text-green-300">
                                  {payment.receipt.receiptNumber}
                                </p>
                              ) : null}
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
                                onClick={() => {
                                  handleDownloadInvoice(linkedInvoice).catch(
                                    (error) => {
                                      console.error(
                                        "Failed to download invoice PDF",
                                        error,
                                      );
                                    },
                                  );
                                }}
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

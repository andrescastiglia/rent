"use client";

import { useAuth } from "@/contexts/auth-context";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  dashboardApi,
  DashboardOperationsOverview,
  PeopleActivityResponse,
  PersonActivityItem,
  PersonActivityStatus,
} from "@/lib/api/dashboard";
import { formatMoneyByCode } from "@/lib/format-money";
import { Building2, CalendarClock, CreditCard, TrendingUp } from "lucide-react";

const STATUS_COLORS: Record<PersonActivityStatus, string> = {
  pending:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  completed:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function formatPersonName(name: string | null | undefined): string {
  return name?.trim() || "Sin asignar";
}

function getMetricValue(
  loading: boolean,
  value: number | null | undefined,
): number | string {
  return loading ? "..." : (value ?? 0);
}

function shouldShowEmptyState(
  loading: boolean,
  items: ReadonlyArray<unknown> | null | undefined,
): boolean {
  return loading ? false : (items?.length ?? 0) === 0;
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [overview, setOverview] = useState<DashboardOperationsOverview | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [peopleActivity, setPeopleActivity] =
    useState<PeopleActivityResponse | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityLimit, setActivityLimit] = useState<10 | 25 | 50>(25);
  const [updatingActivityId, setUpdatingActivityId] = useState<string | null>(
    null,
  );
  const [editingActivity, setEditingActivity] =
    useState<PersonActivityItem | null>(null);
  const [editingComment, setEditingComment] = useState("");

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dashboardApi.getOperationsOverview();
      setOverview(data);
    } catch (error) {
      console.error("Error fetching dashboard operations overview:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPeopleActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const data = await dashboardApi.getRecentActivity(activityLimit);
      setPeopleActivity(data);
    } catch (error) {
      console.error("Error fetching people activity:", error);
    } finally {
      setActivityLoading(false);
    }
  }, [activityLimit]);

  useEffect(() => {
    if (authLoading) return;
    fetchOverview().catch((error) => {
      console.error("Error fetching dashboard overview:", error);
    });
  }, [authLoading, fetchOverview]);

  useEffect(() => {
    if (authLoading) return;
    fetchPeopleActivity().catch((error) => {
      console.error("Error fetching people activity:", error);
    });
  }, [authLoading, fetchPeopleActivity]);

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString(locale);
  };

  const formatDateTime = (dateStr: string | null): string => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString(locale, {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  const handleCompleteActivity = async (activity: PersonActivityItem) => {
    try {
      setUpdatingActivityId(activity.id);
      await dashboardApi.completePersonActivity(activity);
      await fetchPeopleActivity();
    } catch (error) {
      console.error("Failed to complete activity", error);
    } finally {
      setUpdatingActivityId(null);
    }
  };

  const closeEditCommentDialog = () => {
    setEditingActivity(null);
    setEditingComment("");
  };

  const handleEditComment = (activity: PersonActivityItem) => {
    setEditingActivity(activity);
    setEditingComment(activity.body ?? "");
  };

  const handleSaveComment = async () => {
    if (!editingActivity) return;
    try {
      setUpdatingActivityId(editingActivity.id);
      await dashboardApi.updatePersonActivityComment(
        editingActivity,
        editingComment,
      );
      await fetchPeopleActivity();
      closeEditCommentDialog();
    } catch (error) {
      console.error("Failed to edit activity comment", error);
    } finally {
      setUpdatingActivityId(null);
    }
  };

  const renderPeopleTable = (
    items: PersonActivityItem[],
    emptyLabel: string,
  ) => {
    if (items.length === 0) {
      return (
        <p className="text-sm text-gray-600 dark:text-gray-400">{emptyLabel}</p>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <th className="px-4 py-2">
                {t("peopleActivity.columns.person")}
              </th>
              <th className="px-4 py-2">
                {t("peopleActivity.columns.subject")}
              </th>
              <th className="px-4 py-2">{t("peopleActivity.columns.dueAt")}</th>
              <th className="px-4 py-2">
                {t("peopleActivity.columns.status")}
              </th>
              <th className="px-4 py-2">
                {t("peopleActivity.columns.actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-gray-200 dark:border-gray-700 last:border-b-0"
              >
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                  {item.personName}
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {item.sourceType}
                    {item.propertyName ? ` · ${item.propertyName}` : ""}
                  </p>
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                  {item.subject}
                  {item.body ? (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {item.body}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                  {formatDateTime(item.dueAt)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[item.status]}`}
                  >
                    {t(`peopleActivity.statuses.${item.status}`)}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleCompleteActivity(item)}
                      disabled={updatingActivityId === item.id}
                      className="px-2 py-1 rounded-sm bg-green-600 text-white disabled:opacity-50"
                    >
                      {t("peopleActivity.actions.complete")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditComment(item)}
                      disabled={updatingActivityId === item.id}
                      className="px-2 py-1 rounded-sm bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 disabled:opacity-50"
                    >
                      {t("peopleActivity.actions.editComment")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const propertyPanel = overview?.propertiesPanel;
  const paymentsPanel = overview?.paymentsPanel;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-linear-to-r from-amber-50 via-white to-emerald-50 p-6 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
          Sistema de Gestión Inmobiliaria
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
          {t("welcome", { name: `${user?.firstName} ${user?.lastName}` })}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Link
          href={`/${locale}/dashboard/rentals`}
          className="rounded-3xl border border-sky-200 bg-sky-50 p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-sky-900/40 dark:bg-sky-950/20"
        >
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
            Dashboard
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
            Alquileres
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Vigentes, vencidos, por vencer, busqueda por apellido y acceso
            rapido a cobros.
          </p>
        </Link>

        <Link
          href={`/${locale}/dashboard/sales`}
          className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-emerald-900/40 dark:bg-emerald-950/20"
        >
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
            Dashboard
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
            Ventas
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Carpetas, acuerdos, cuotas a seguir y busqueda por apellido del
            comprador.
          </p>
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 bg-slate-950 px-6 py-5 text-white dark:border-slate-800">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                  <Building2 size={20} />
                </span>
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-300">
                    Panel Principal
                  </p>
                  <h2 className="text-xl font-semibold">Propiedades</h2>
                </div>
              </div>
              <Link
                href={`/${locale}/properties`}
                className="rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
              >
                Ver panel
              </Link>
            </div>
          </div>

          <div className="space-y-6 p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/40">
                <p className="text-xs uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                  Venta
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                  {getMetricValue(loading, propertyPanel?.saleCount)}
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  propiedades publicadas para venta
                </p>
              </div>
              <div className="rounded-2xl bg-blue-50 p-4 dark:bg-blue-950/40">
                <p className="text-xs uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
                  Alquileres Vigentes
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                  {getMetricValue(loading, propertyPanel?.rentalActiveCount)}
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  contratos activos para seguimiento
                </p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4 dark:bg-amber-950/40">
                <p className="text-xs uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
                  Vencen Este Mes
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                  {getMetricValue(
                    loading,
                    propertyPanel?.expiringThisMonthCount,
                  )}
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  revisar para renovar ahora
                </p>
              </div>
              <div className="rounded-2xl bg-rose-50 p-4 dark:bg-rose-950/40">
                <p className="text-xs uppercase tracking-[0.16em] text-rose-700 dark:text-rose-300">
                  Vencidos
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                  {getMetricValue(loading, propertyPanel?.rentalExpiredCount)}
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  contratos para regularizar o renovar
                </p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Venta destacada
                  </h3>
                  <Link
                    href={`/${locale}/properties`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Ir a ventas
                  </Link>
                </div>
                <div className="space-y-3">
                  {(propertyPanel?.saleHighlights ?? []).map((item) => (
                    <div
                      key={item.propertyId}
                      className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
                    >
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {item.propertyName}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {item.propertyAddress || "Sin dirección"}
                      </p>
                      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                        {item.salePrice === null
                          ? "Precio a definir"
                          : formatMoneyByCode(
                              item.salePrice,
                              item.saleCurrency,
                              locale,
                            )}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Propietario: {formatPersonName(item.ownerName)}
                      </p>
                    </div>
                  ))}
                  {shouldShowEmptyState(
                    loading,
                    propertyPanel?.saleHighlights,
                  ) ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      No hay propiedades en venta para mostrar.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                      Vencimientos del Mes
                    </h3>
                    <CalendarClock size={16} className="text-amber-500" />
                  </div>
                  <div className="space-y-2">
                    {(propertyPanel?.expiringThisMonth ?? []).map((item) => (
                      <div
                        key={item.leaseId}
                        className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/20"
                      >
                        <p className="font-medium text-slate-900 dark:text-white">
                          {item.propertyName}
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {formatPersonName(item.tenantName)} · vence{" "}
                          {formatDate(item.endDate)}
                        </p>
                      </div>
                    ))}
                    {shouldShowEmptyState(
                      loading,
                      propertyPanel?.expiringThisMonth,
                    ) ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        No hay vencimientos este mes.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                      Próximos 4 Meses
                    </h3>
                    <TrendingUp size={16} className="text-blue-500" />
                  </div>
                  <div className="space-y-2">
                    {(propertyPanel?.expiringNextFourMonths ?? []).map(
                      (item) => (
                        <div
                          key={item.leaseId}
                          className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800"
                        >
                          <p className="font-medium text-slate-900 dark:text-white">
                            {item.propertyName}
                          </p>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            {formatPersonName(item.ownerName)} · vence{" "}
                            {formatDate(item.endDate)}
                          </p>
                        </div>
                      ),
                    )}
                    {shouldShowEmptyState(
                      loading,
                      propertyPanel?.expiringNextFourMonths,
                    ) ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        No hay renovaciones en la ventana de cuatro meses.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 bg-linear-to-r from-slate-900 to-slate-800 px-6 py-5 text-white dark:border-slate-800">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                  <CreditCard size={20} />
                </span>
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-300">
                    Panel Principal
                  </p>
                  <h2 className="text-xl font-semibold">Pagos</h2>
                </div>
              </div>
              <Link
                href={`/${locale}/payments`}
                className="rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
              >
                Ver panel
              </Link>
            </div>
          </div>

          <div className="space-y-6 p-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Total
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                  {getMetricValue(loading, paymentsPanel?.totalPayments)}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                <p className="text-xs uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
                  Pendientes
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                  {getMetricValue(loading, paymentsPanel?.pendingPayments)}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
                <p className="text-xs uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                  Realizados
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                  {getMetricValue(loading, paymentsPanel?.completedPayments)}
                </p>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 dark:border-rose-900 dark:bg-rose-950/20">
                <p className="text-xs uppercase tracking-[0.16em] text-rose-700 dark:text-rose-300">
                  Facturas Vencidas
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                  {getMetricValue(loading, paymentsPanel?.overdueInvoices)}
                </p>
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Últimos movimientos
              </h3>
              <div className="space-y-3">
                {(paymentsPanel?.recentPayments ?? []).map((payment) => (
                  <div
                    key={payment.paymentId}
                    className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {payment.propertyName || "Propiedad sin vincular"}
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {formatPersonName(payment.tenantName)} ·{" "}
                          {payment.activityType}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {formatDate(payment.paymentDate)} · estado{" "}
                          {payment.status}
                        </p>
                      </div>
                      <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                        {formatMoneyByCode(
                          payment.amount,
                          payment.currencyCode,
                          locale,
                        )}
                      </p>
                    </div>
                  </div>
                ))}
                {shouldShowEmptyState(
                  loading,
                  paymentsPanel?.recentPayments,
                ) ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No hay pagos recientes para mostrar.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t("peopleActivity.title")}
          </h2>
          <select
            value={activityLimit}
            onChange={(e) =>
              setActivityLimit(Number(e.target.value) as 10 | 25 | 50)
            }
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value={10}>{t("activity.show", { count: 10 })}</option>
            <option value={25}>{t("activity.show", { count: 25 })}</option>
            <option value={50}>{t("activity.show", { count: 50 })}</option>
          </select>
        </div>

        <div className="p-6 space-y-6">
          {activityLoading ? (
            <p className="text-gray-600 dark:text-gray-400">{t("loading")}</p>
          ) : (
            <>
              <section>
                <h3 className="text-md font-semibold text-red-700 dark:text-red-400 mb-3">
                  {t("peopleActivity.overdueTitle")}
                </h3>
                {renderPeopleTable(
                  peopleActivity?.overdue ?? [],
                  t("peopleActivity.noOverdue"),
                )}
              </section>
              <section>
                <h3 className="text-md font-semibold text-blue-700 dark:text-blue-400 mb-3">
                  {t("peopleActivity.todayTitle")}
                </h3>
                {renderPeopleTable(
                  peopleActivity?.today ?? [],
                  t("peopleActivity.noToday"),
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {editingActivity ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {t("peopleActivity.editCommentTitle")}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {editingActivity.subject}
              </p>
            </div>
            <div className="p-4">
              <textarea
                value={editingComment}
                onChange={(e) => setEditingComment(e.target.value)}
                rows={5}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm text-gray-900 dark:text-white"
                placeholder={t("peopleActivity.editCommentPlaceholder")}
              />
            </div>
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEditCommentDialog}
                className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200"
              >
                {t("peopleActivity.actions.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void handleSaveComment()}
                disabled={updatingActivityId === editingActivity.id}
                className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm disabled:opacity-50"
              >
                {t("peopleActivity.actions.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Payment,
  PaymentActivityType,
  PaymentFilters,
  PaymentStatus,
} from "@/types/payment";
import { paymentsApi } from "@/lib/api/payments";
import { ownersApi } from "@/lib/api/owners";
import { OwnerSettlementSummary } from "@/types/owner";
import { leasesApi } from "@/lib/api/leases";
import { propertiesApi } from "@/lib/api/properties";
import { Search, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import Link from "next/link";
import { formatMoneyByCode } from "@/lib/format-money";
import { Lease } from "@/types/lease";
import { Property } from "@/types/property";
import { normalizeSearchText } from "@/lib/search";

const activityTypeLabels: Record<PaymentActivityType, string> = {
  monthly: "Mensual",
  annual: "Anual",
  adjustment: "Ajuste",
  late_fee: "Mora",
  extraordinary: "Extraordinario",
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: "Pendiente",
  processing: "Procesando",
  completed: "Realizado",
  failed: "Fallido",
  refunded: "Reintegrado",
  cancelled: "Cancelado",
};

function getPaymentContext(payment: Payment): {
  propertyName: string;
  tenantName: string;
  leaseId: string | null;
} {
  const lease = payment.tenantAccount?.lease;
  const tenant = lease?.tenant;

  return {
    propertyName: lease?.property?.name ?? "Sin propiedad",
    tenantName:
      `${tenant?.firstName ?? ""} ${tenant?.lastName ?? ""}`.trim() ||
      "Sin inquilino",
    leaseId: lease?.id ?? null,
  };
}

export default function PaymentsPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations("payments");
  const locale = useLocale();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [ownerPayments, setOwnerPayments] = useState<OwnerSettlementSummary[]>(
    [],
  );
  const [properties, setProperties] = useState<Property[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [activityTypeFilter, setActivityTypeFilter] = useState<string>("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [leaseFilter, setLeaseFilter] = useState("");

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      const filters: PaymentFilters = {};
      if (statusFilter) {
        filters.status = statusFilter as PaymentStatus;
      }
      if (activityTypeFilter) {
        filters.activityType = activityTypeFilter as PaymentActivityType;
      }
      if (propertyFilter) {
        filters.propertyId = propertyFilter;
      }
      if (leaseFilter) {
        filters.leaseId = leaseFilter;
      }

      const [tenantResult, ownerResult, propertiesResult, leasesResult] =
        await Promise.all([
          paymentsApi.getAll(filters),
          ownersApi.listSettlementPayments(50),
          propertiesApi.getAll(),
          leasesApi.getAll({ includeFinalized: true, contractType: "rental" }),
        ]);

      setPayments(tenantResult.data);
      setOwnerPayments(ownerResult);
      setProperties(propertiesResult);
      setLeases(leasesResult);
    } catch (error) {
      console.error("Failed to load payments", error);
    } finally {
      setLoading(false);
    }
  }, [activityTypeFilter, leaseFilter, propertyFilter, statusFilter]);

  useEffect(() => {
    if (authLoading) return;
    loadPayments().catch((error) => {
      console.error("Failed to load payments", error);
    });
  }, [loadPayments, authLoading]);

  const filteredPayments = useMemo(() => {
    const term = normalizeSearchText(searchTerm);
    if (!term) {
      return payments;
    }

    return payments.filter((payment) => {
      const context = getPaymentContext(payment);
      const haystack = [
        context.propertyName,
        context.tenantName,
        payment.reference ?? "",
        payment.receipt?.receiptNumber ?? "",
        activityTypeLabels[payment.activityType] ?? payment.activityType,
      ].join(" ");
      return normalizeSearchText(haystack).includes(term);
    });
  }, [payments, searchTerm]);

  const selectedPropertyLeases = useMemo(() => {
    if (!propertyFilter) {
      return leases;
    }
    return leases.filter((lease) => lease.propertyId === propertyFilter);
  }, [leases, propertyFilter]);
  const activeLeaseMatches = useMemo(() => {
    const term = normalizeSearchText(searchTerm);
    if (!term) {
      return [];
    }

    return leases
      .filter((lease) => lease.status === "ACTIVE")
      .filter((lease) =>
        propertyFilter ? lease.propertyId === propertyFilter : true,
      )
      .filter((lease) =>
        normalizeSearchText(
          [
            lease.tenant?.firstName ?? "",
            lease.tenant?.lastName ?? "",
            lease.property?.name ?? "",
          ].join(" "),
        ).includes(term),
      )
      .slice(0, 8);
  }, [leases, propertyFilter, searchTerm]);

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Sistema de Gestión Inmobiliaria
          </p>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t("title")}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Gestión por propiedad, contrato y estado de cobro.
          </p>
        </div>
        <Link
          href={`/${locale}/payments/new`}
          className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
        >
          Registrar pago
        </Link>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-4 lg:grid-cols-[2fr_repeat(4,minmax(0,1fr))]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por propiedad, inquilino, recibo o referencia"
              className="block w-full rounded-2xl border border-gray-300 bg-white py-3 pl-10 pr-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-slate-950 dark:text-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            value={propertyFilter}
            onChange={(e) => {
              setPropertyFilter(e.target.value);
              setLeaseFilter("");
            }}
            className="rounded-2xl border border-gray-300 bg-white px-3 py-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="">Todas las propiedades</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>

          <select
            value={leaseFilter}
            onChange={(e) => setLeaseFilter(e.target.value)}
            className="rounded-2xl border border-gray-300 bg-white px-3 py-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="">Todos los contratos</option>
            {selectedPropertyLeases.map((lease) => (
              <option key={lease.id} value={lease.id}>
                {lease.property?.name ?? "Propiedad"} ·{" "}
                {lease.tenant?.firstName} {lease.tenant?.lastName}
              </option>
            ))}
          </select>

          <select
            value={activityTypeFilter}
            onChange={(e) => setActivityTypeFilter(e.target.value)}
            className="rounded-2xl border border-gray-300 bg-white px-3 py-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="">Todas las actividades</option>
            {Object.entries(activityTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-2xl border border-gray-300 bg-white px-3 py-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="">Todos los estados</option>
            {Object.entries(paymentStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setSearchTerm("");
              setStatusFilter("");
              setActivityTypeFilter("");
              setPropertyFilter("");
              setLeaseFilter("");
            }}
            className="rounded-2xl border border-gray-300 px-3 py-3 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-slate-950"
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Pagos listados
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                {filteredPayments.length}
              </p>
            </div>
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-900 dark:bg-amber-950/20">
              <p className="text-xs uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
                Pendientes
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                {
                  filteredPayments.filter(
                    (payment) => payment.status === "pending",
                  ).length
                }
              </p>
            </div>
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20">
              <p className="text-xs uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                Realizados
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                {
                  filteredPayments.filter(
                    (payment) => payment.status === "completed",
                  ).length
                }
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Liquidaciones a propietarios
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                {ownerPayments.length}
              </p>
            </div>
          </div>

          {activeLeaseMatches.length > 0 ? (
            <div className="rounded-3xl border border-sky-200 bg-sky-50 p-6 shadow-sm dark:border-sky-900 dark:bg-sky-950/20">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Contratos encontrados para cobrar
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Resultado rapido por apellido para registrar un pago con la
                  menor cantidad de pasos posible.
                </p>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {activeLeaseMatches.map((lease) => (
                  <div
                    key={lease.id}
                    className="rounded-2xl border border-sky-200 bg-white p-4 dark:border-sky-900/40 dark:bg-slate-900"
                  >
                    <p className="font-medium text-slate-900 dark:text-white">
                      {`${lease.tenant?.firstName ?? ""} ${lease.tenant?.lastName ?? ""}`.trim() ||
                        "Sin inquilino"}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {lease.property?.name ?? "Propiedad sin nombre"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <Link
                        href={`/${locale}/leases/${lease.id}`}
                        className="text-sm text-slate-700 hover:underline dark:text-slate-200"
                      >
                        Ver ficha
                      </Link>
                      <Link
                        href={`/${locale}/payments/new?leaseId=${lease.id}`}
                        className="text-sm font-medium text-blue-600 hover:underline"
                      >
                        Registrar pago directo
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Operación por contrato
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-slate-50 dark:bg-slate-950">
                  <tr className="text-left text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    <th className="px-6 py-4">Propiedad</th>
                    <th className="px-6 py-4">Contrato</th>
                    <th className="px-6 py-4">Actividad</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4">Monto</th>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((payment) => {
                    const context = getPaymentContext(payment);
                    return (
                      <tr
                        key={payment.id}
                        className="border-t border-slate-200 dark:border-slate-800"
                      >
                        <td className="px-6 py-4 align-top">
                          <p className="font-medium text-slate-900 dark:text-white">
                            {context.propertyName}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {context.tenantName}
                          </p>
                        </td>
                        <td className="px-6 py-4 align-top text-sm text-slate-600 dark:text-slate-300">
                          {context.leaseId ? context.leaseId.slice(0, 8) : "-"}
                          {payment.reference ? (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {payment.reference}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-6 py-4 align-top">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {activityTypeLabels[payment.activityType] ??
                              payment.activityType}
                          </span>
                        </td>
                        <td className="px-6 py-4 align-top text-sm text-slate-600 dark:text-slate-300">
                          {paymentStatusLabels[payment.status] ??
                            payment.status}
                        </td>
                        <td className="px-6 py-4 align-top font-semibold text-slate-900 dark:text-white">
                          {formatMoneyByCode(
                            payment.amount,
                            payment.currencyCode,
                            locale,
                          )}
                        </td>
                        <td className="px-6 py-4 align-top text-sm text-slate-600 dark:text-slate-300">
                          {new Date(payment.paymentDate).toLocaleDateString(
                            locale,
                          )}
                        </td>
                        <td className="px-6 py-4 align-top">
                          <Link
                            href={`/${locale}/payments/${payment.id}`}
                            className="text-sm text-blue-600 hover:underline"
                          >
                            Ver detalle
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredPayments.length === 0 ? (
                <div className="px-6 py-10 text-sm text-slate-500 dark:text-slate-400">
                  No hay pagos que coincidan con los filtros seleccionados.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Pagos a propietarios
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Liquidaciones registradas como salida de fondos.
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {ownerPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900 dark:bg-rose-950/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {payment.ownerName}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {payment.period}
                      </p>
                    </div>
                    <p className="font-semibold text-rose-700 dark:text-rose-300">
                      {formatMoneyByCode(
                        payment.netAmount,
                        payment.currencyCode,
                        locale,
                      )}
                    </p>
                  </div>
                </div>
              ))}
              {ownerPayments.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No hay liquidaciones registradas.
                </p>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

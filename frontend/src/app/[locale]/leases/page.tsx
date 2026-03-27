"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Lease } from "@/types/lease";
import { leasesApi } from "@/lib/api/leases";
import { Search, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { formatMoneyByCode } from "@/lib/format-money";
import { normalizeSearchText } from "@/lib/search";

function normalizeDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function LeaseSection({
  title,
  subtitle,
  leases,
  locale,
}: Readonly<{
  title: string;
  subtitle: string;
  leases: Lease[];
  locale: string;
}>) {
  if (leases.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-900/40">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {subtitle}
        </p>
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          Sin contratos en esta sección.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {leases.map((lease) => (
          <Link
            key={lease.id}
            href={`/${locale}/leases/${lease.id}`}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-slate-900 dark:text-white">
                  {lease.property?.name ?? "Propiedad sin nombre"}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {`${lease.tenant?.firstName ?? ""} ${lease.tenant?.lastName ?? ""}`.trim() ||
                    "Sin inquilino"}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {lease.status}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                  Inicio
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  {lease.startDate
                    ? new Date(lease.startDate).toLocaleDateString(locale)
                    : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                  Fin
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  {lease.endDate
                    ? new Date(lease.endDate).toLocaleDateString(locale)
                    : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                  Canon
                </p>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {lease.rentAmount === undefined
                    ? "-"
                    : formatMoneyByCode(
                        lease.rentAmount,
                        lease.currency,
                        locale,
                      )}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-3 dark:bg-slate-950">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                Alertas de renovación
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {lease.renewalAlertEnabled
                  ? `Activas · ${lease.renewalAlertPeriodicity ?? "monthly"}`
                  : "Desactivadas"}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function LeasesPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations("leases");
  const locale = useLocale();
  const [leases, setLeases] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (authLoading) return;

    const loadLeases = async () => {
      try {
        const data = await leasesApi.getAll({
          includeFinalized: true,
          contractType: "rental",
        });
        setLeases(data);
      } catch (error) {
        console.error("Failed to load leases", error);
      } finally {
        setLoading(false);
      }
    };

    loadLeases().catch((error) => {
      console.error("Failed to load leases", error);
    });
  }, [authLoading]);

  const filteredLeases = useMemo(() => {
    const term = normalizeSearchText(searchTerm);
    if (!term) return leases;

    return leases.filter((lease) => {
      const haystack = [
        lease.property?.name ?? "",
        lease.tenant?.firstName ?? "",
        lease.tenant?.lastName ?? "",
        lease.property?.address.city ?? "",
      ].join(" ");
      return normalizeSearchText(haystack).includes(term);
    });
  }, [leases, searchTerm]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  endOfMonth.setHours(23, 59, 59, 999);

  const nextFourMonths = new Date(today);
  nextFourMonths.setMonth(nextFourMonths.getMonth() + 4);
  nextFourMonths.setHours(23, 59, 59, 999);

  const currentRentals = filteredLeases.filter((lease) => {
    const endDate = normalizeDate(lease.endDate);
    return lease.status === "ACTIVE" && (!endDate || endDate >= today);
  });

  const expiringThisMonth = currentRentals.filter((lease) => {
    const endDate = normalizeDate(lease.endDate);
    return endDate !== null && endDate >= today && endDate <= endOfMonth;
  });

  const expiringNextFourMonths = currentRentals.filter((lease) => {
    const endDate = normalizeDate(lease.endDate);
    return (
      endDate !== null && endDate > endOfMonth && endDate <= nextFourMonths
    );
  });

  const expiredRentals = filteredLeases.filter((lease) => {
    const endDate = normalizeDate(lease.endDate);
    if (endDate === null) {
      return lease.status === "FINALIZED";
    }
    return endDate < today || lease.status === "FINALIZED";
  });

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t("title")}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Vencimientos organizados por prioridad de renovación.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/${locale}/leases/import`}
            className="inline-flex items-center px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200"
          >
            Cargar contrato actual
          </Link>
          <Link
            href={`/${locale}/templates`}
            className="inline-flex items-center px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200"
          >
            {t("manageTemplates")}
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Buscar por propiedad, inquilino o ciudad"
            className="block w-full rounded-2xl border border-gray-300 bg-white py-3 pl-10 pr-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-slate-950 dark:text-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
        </div>
      ) : (
        <div className="space-y-8">
          <LeaseSection
            title="Alquileres vigentes"
            subtitle="Contratos activos con seguimiento diario."
            leases={currentRentals}
            locale={locale}
          />
          <LeaseSection
            title="Vencen este mes"
            subtitle="Prioridad alta para contactar propietarios y renovar."
            leases={expiringThisMonth}
            locale={locale}
          />
          <LeaseSection
            title="Próximos cuatro meses"
            subtitle="Ventana de previsión para planificar renovaciones."
            leases={expiringNextFourMonths}
            locale={locale}
          />
          <LeaseSection
            title="Alquileres vencidos"
            subtitle="Contratos que requieren regularización o renovación."
            leases={expiredRentals}
            locale={locale}
          />
        </div>
      )}
    </div>
  );
}

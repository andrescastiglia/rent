"use client";

import { dashboardApi, DashboardLeaseOperationItem } from "@/lib/api/dashboard";
import { formatMoneyByCode } from "@/lib/format-money";
import { normalizeSearchText } from "@/lib/search";
import { useAuth } from "@/contexts/auth-context";
import { CalendarClock, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useState } from "react";

function LeaseCard({
  lease,
  locale,
}: Readonly<{
  lease: DashboardLeaseOperationItem;
  locale: string;
}>) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-slate-900 dark:text-white">
            {lease.tenantName ?? "Sin titular"}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {lease.propertyName ?? "Propiedad sin nombre"}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {lease.propertyAddress ?? "Sin direccion"}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {lease.status}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
            Propietario
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {lease.ownerName ?? "-"}
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
            {lease.monthlyRent === null
              ? "-"
              : formatMoneyByCode(lease.monthlyRent, lease.currency, locale)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href={`/${locale}/leases/${lease.leaseId}`}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-950"
        >
          Ver ficha completa
        </Link>
        <Link
          href={`/${locale}/payments/new?leaseId=${lease.leaseId}`}
          className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
        >
          Registrar pago
        </Link>
      </div>
    </div>
  );
}

export default function RentalsDashboardPage() {
  const locale = useLocale();
  const { loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [overview, setOverview] = useState<Awaited<
    ReturnType<typeof dashboardApi.getOperationsOverview>
  > | null>(null);

  useEffect(() => {
    if (authLoading) return;

    const loadOverview = async () => {
      try {
        setLoading(true);
        const data = await dashboardApi.getOperationsOverview();
        setOverview(data);
      } catch (error) {
        console.error("Failed to load rentals dashboard", error);
      } finally {
        setLoading(false);
      }
    };

    void loadOverview();
  }, [authLoading]);

  const term = normalizeSearchText(searchTerm);
  const currentRentals = useMemo(
    () => overview?.propertiesPanel.currentRentals ?? [],
    [overview],
  );
  const expiringThisMonth = useMemo(
    () => overview?.propertiesPanel.expiringThisMonth ?? [],
    [overview],
  );
  const expiredRentals = useMemo(
    () => overview?.propertiesPanel.expiredRentals ?? [],
    [overview],
  );
  const currentResults = useMemo(
    () =>
      currentRentals.filter((lease) =>
        normalizeSearchText(lease.tenantName).includes(term),
      ),
    [currentRentals, term],
  );

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-sky-200 bg-sky-50 p-6 shadow-sm dark:border-sky-900/40 dark:bg-sky-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
              Dashboard de Alquileres
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
              Seguimiento operativo diario
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
              Clasificacion duplicada para vigentes, vencidos y por vencer en el
              mes, con busqueda parcial por apellido y accesos directos a la
              ficha completa y al cobro.
            </p>
          </div>
          <Link
            href={`/${locale}/dashboard`}
            className="rounded-full border border-sky-300 px-4 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 dark:border-sky-700 dark:text-sky-100 dark:hover:bg-sky-900/40"
          >
            Volver al panel general
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Vigentes
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
            {currentRentals.length}
          </p>
        </div>
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-900 dark:bg-amber-950/20">
          <p className="text-xs uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
            Por vencer este mes
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
            {expiringThisMonth.length}
          </p>
        </div>
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 shadow-sm dark:border-rose-900 dark:bg-rose-950/20">
          <p className="text-xs uppercase tracking-[0.16em] text-rose-700 dark:text-rose-300">
            Vencidos
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
            {expiredRentals.length}
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <label
          htmlFor="rentals-search"
          className="mb-3 block text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          Buscar alquiler vigente por apellido
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            id="rentals-search"
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Ejemplo: perez"
            className="block w-full rounded-2xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>
      </div>

      {term ? (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-sky-600" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Resultados en vigentes
            </h2>
          </div>
          {currentResults.length > 0 ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {currentResults.map((lease) => (
                <LeaseCard key={lease.leaseId} lease={lease} locale={locale} />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
              No encontramos alquileres vigentes para ese apellido.
            </div>
          )}
        </section>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Alquileres vigentes
        </h2>
        <div className="grid gap-4 xl:grid-cols-2">
          {currentRentals.map((lease) => (
            <LeaseCard key={lease.leaseId} lease={lease} locale={locale} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Por vencer este mes
        </h2>
        <div className="grid gap-4 xl:grid-cols-2">
          {expiringThisMonth.map((lease) => (
            <LeaseCard key={lease.leaseId} lease={lease} locale={locale} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Vencidos
        </h2>
        <div className="grid gap-4 xl:grid-cols-2">
          {expiredRentals.map((lease) => (
            <LeaseCard key={lease.leaseId} lease={lease} locale={locale} />
          ))}
        </div>
      </section>
    </div>
  );
}

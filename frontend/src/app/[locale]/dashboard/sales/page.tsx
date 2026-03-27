"use client";

import { salesApi } from "@/lib/api/sales";
import { formatMoneyByCode } from "@/lib/format-money";
import { normalizeSearchText } from "@/lib/search";
import { useAuth } from "@/contexts/auth-context";
import { SaleAgreement, SaleFolder, SaleReceipt } from "@/types/sales";
import { Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useState } from "react";

function parseDateOnly(value: string): Date {
  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getNextDueDate(agreement: SaleAgreement): Date | null {
  const installmentAmount = Number(agreement.installmentAmount || 0);
  if (installmentAmount <= 0) {
    return null;
  }

  const paidInstallments = Math.floor(
    Number(agreement.paidAmount || 0) / installmentAmount,
  );
  const nextInstallmentNumber = paidInstallments + 1;
  if (nextInstallmentNumber > agreement.installmentCount) {
    return null;
  }

  const start = parseDateOnly(agreement.startDate);
  return new Date(
    start.getFullYear(),
    start.getMonth() + (nextInstallmentNumber - 1),
    agreement.dueDay || 10,
  );
}

function SaleAgreementCard({
  agreement,
  folder,
  locale,
  nextDueDate,
}: Readonly<{
  agreement: SaleAgreement;
  folder?: SaleFolder;
  locale: string;
  nextDueDate: Date | null;
}>) {
  const remaining =
    Number(agreement.totalAmount) - Number(agreement.paidAmount);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-slate-900 dark:text-white">
            {agreement.buyerName}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {folder?.name ?? "Sin carpeta"} · {agreement.buyerPhone}
          </p>
        </div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {agreement.installmentCount} cuotas
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
            Total
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {formatMoneyByCode(
              Number(agreement.totalAmount),
              agreement.currency,
              locale,
            )}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
            Pagado
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {formatMoneyByCode(
              Number(agreement.paidAmount),
              agreement.currency,
              locale,
            )}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
            Saldo
          </p>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {formatMoneyByCode(remaining, agreement.currency, locale)}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 p-3 dark:bg-slate-950">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
          Proximo vencimiento
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-200">
          {nextDueDate
            ? nextDueDate.toLocaleDateString(locale)
            : "Sin cuotas pendientes"}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href={`/${locale}/sales`}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-950"
        >
          Ir al modulo de ventas
        </Link>
      </div>
    </div>
  );
}

export default function SalesDashboardPage() {
  const locale = useLocale();
  const { loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [folders, setFolders] = useState<SaleFolder[]>([]);
  const [agreements, setAgreements] = useState<SaleAgreement[]>([]);
  const [receipts, setReceipts] = useState<Record<string, SaleReceipt[]>>({});

  useEffect(() => {
    if (authLoading) return;

    const loadData = async () => {
      try {
        setLoading(true);
        const [foldersData, agreementsData] = await Promise.all([
          salesApi.getFolders(),
          salesApi.getAgreements(),
        ]);

        const receiptsEntries = await Promise.all(
          agreementsData.map(async (agreement) => [
            agreement.id,
            await salesApi.getReceipts(agreement.id),
          ]),
        );

        setFolders(foldersData);
        setAgreements(agreementsData);
        setReceipts(Object.fromEntries(receiptsEntries));
      } catch (error) {
        console.error("Failed to load sales dashboard", error);
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [authLoading]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const folderMap = useMemo(
    () => Object.fromEntries(folders.map((folder) => [folder.id, folder])),
    [folders],
  );
  const term = normalizeSearchText(searchTerm);
  const agreementsWithNextDue = useMemo(
    () =>
      agreements.map((agreement) => ({
        agreement,
        nextDueDate: getNextDueDate(agreement),
      })),
    [agreements],
  );
  const overdueAgreements = agreementsWithNextDue.filter(
    ({ nextDueDate }) => nextDueDate && nextDueDate < today,
  );
  const dueThisMonthAgreements = agreementsWithNextDue.filter(
    ({ nextDueDate }) => {
      if (!nextDueDate) return false;
      return (
        nextDueDate.getFullYear() === today.getFullYear() &&
        nextDueDate.getMonth() === today.getMonth()
      );
    },
  );
  const filteredAgreements = agreementsWithNextDue.filter(({ agreement }) =>
    normalizeSearchText(agreement.buyerName).includes(term),
  );
  const recentReceipts = Object.values(receipts)
    .flat()
    .sort(
      (left, right) =>
        new Date(right.paymentDate).getTime() -
        new Date(left.paymentDate).getTime(),
    )
    .slice(0, 5);

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
              Dashboard de Ventas
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
              Seguimiento de acuerdos y cuotas
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
              Vista operativa de carpetas, acuerdos activos, cuotas vencidas,
              cuotas por vencer este mes y busqueda parcial por apellido del
              comprador.
            </p>
          </div>
          <Link
            href={`/${locale}/dashboard`}
            className="rounded-full border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-100 dark:hover:bg-emerald-900/40"
          >
            Volver al panel general
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Carpetas
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
            {folders.length}
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Acuerdos
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
            {agreements.length}
          </p>
        </div>
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 shadow-sm dark:border-rose-900 dark:bg-rose-950/20">
          <p className="text-xs uppercase tracking-[0.16em] text-rose-700 dark:text-rose-300">
            Cuotas vencidas
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
            {overdueAgreements.length}
          </p>
        </div>
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-900 dark:bg-amber-950/20">
          <p className="text-xs uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
            Por vencer este mes
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
            {dueThisMonthAgreements.length}
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <label
          htmlFor="sales-search"
          className="mb-3 block text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          Buscar acuerdo por apellido del comprador
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            id="sales-search"
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Ejemplo: lopez"
            className="block w-full rounded-2xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>
      </div>

      {term ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Resultados
          </h2>
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredAgreements.map(({ agreement, nextDueDate }) => (
              <SaleAgreementCard
                key={agreement.id}
                agreement={agreement}
                folder={folderMap[agreement.folderId]}
                locale={locale}
                nextDueDate={nextDueDate}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Acuerdos a seguir
        </h2>
        <div className="grid gap-4 xl:grid-cols-2">
          {agreementsWithNextDue.map(({ agreement, nextDueDate }) => (
            <SaleAgreementCard
              key={agreement.id}
              agreement={agreement}
              folder={folderMap[agreement.folderId]}
              locale={locale}
              nextDueDate={nextDueDate}
            />
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Cobranzas recientes
        </h2>
        <div className="mt-4 space-y-3">
          {recentReceipts.map((receipt) => (
            <div
              key={receipt.id}
              className="flex flex-col gap-1 rounded-2xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-950"
            >
              <p className="font-medium text-slate-900 dark:text-white">
                {receipt.receiptNumber}
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                {new Date(receipt.paymentDate).toLocaleDateString(locale)} ·{" "}
                {formatMoneyByCode(receipt.amount, receipt.currency, locale)}
              </p>
            </div>
          ))}
          {recentReceipts.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No hay cobranzas recientes.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

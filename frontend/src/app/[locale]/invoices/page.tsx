"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Invoice, InvoiceFilters, InvoiceStatus } from "@/types/payment";
import { invoicesApi } from "@/lib/api/payments";
import { InvoiceCard } from "@/components/invoices/InvoiceCard";
import { Search, Filter, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { Button, PageHeader, Pagination, StatePanel } from "@/components/ui";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

function InvoicesList({
  invoices,
  t,
}: Readonly<{
  invoices: Invoice[];
  t: (key: string) => string;
}>) {
  if (invoices.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
        <FileText className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
          {t("noInvoices")}
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t("noInvoicesDescription")}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {invoices.map((invoice) => (
        <InvoiceCard key={invoice.id} invoice={invoice} />
      ))}
    </div>
  );
}

export default function InvoicesPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations("invoices");
  const tc = useTranslations("common");

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);
  const search = useDebouncedValue(searchTerm);

  const loadInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const filters: InvoiceFilters = {
        page,
        limit: 20,
        search: search || undefined,
      };
      if (statusFilter) {
        filters.status = statusFilter as InvoiceStatus;
      }
      const result = await invoicesApi.getAll(filters);
      setInvoices(result.data);
      setTotal(result.total);
    } catch (error) {
      setError(true);
      console.error("Failed to load invoices", error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, search]);

  useEffect(() => {
    if (authLoading) return;
    loadInvoices();
  }, [loadInvoices, authLoading]);

  let panelContent1;
  if (error) {
    panelContent1 = (
      <StatePanel
        error
        title={tc("error")}
        action={
          <Button variant="secondary" onClick={() => void loadInvoices()}>
            {tc("retry")}
          </Button>
        }
      />
    );
  } else if (loading) {
    panelContent1 = <StatePanel busy title={tc("loading")} />;
  } else {
    panelContent1 = (
      <>
        <InvoicesList invoices={invoices} t={t} />
        <Pagination
          page={page}
          pageSize={20}
          total={total}
          onPageChange={setPage}
        />
      </>
    );
  }
  return (
    <div className="container mx-auto px-4 py-8">
      <PageHeader title={t("title")} description={t("subtitle")} />

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <label htmlFor="invoices-search" className="sr-only">
            {t("searchPlaceholder")}
          </label>
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            id="invoices-search"
            type="search"
            placeholder={t("searchPlaceholder")}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="relative">
          <label htmlFor="invoices-status-filter" className="sr-only">
            {t("allStatuses")}
          </label>
          <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <select
            id="invoices-status-filter"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="block w-full pl-10 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="">{t("allStatuses")}</option>
            <option value="draft">{t("status.draft")}</option>
            <option value="pending">{t("status.pending")}</option>
            <option value="sent">{t("status.sent")}</option>
            <option value="partial">{t("status.partial")}</option>
            <option value="paid">{t("status.paid")}</option>
            <option value="overdue">{t("status.overdue")}</option>
            <option value="cancelled">{t("status.cancelled")}</option>
            <option value="refunded">{t("status.refunded")}</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {panelContent1}
    </div>
  );
}

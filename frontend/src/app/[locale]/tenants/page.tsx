"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Tenant } from "@/types/tenant";
import { tenantsApi } from "@/lib/api/tenants";
import { Search, Loader2, Edit, Wallet, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";

export default function TenantsPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations("tenants");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (authLoading) return;
    loadTenants();
  }, [authLoading]);

  useEffect(() => {
    if (authLoading) return;
    const handle = setTimeout(() => {
      setLoading(true);
      loadTenants(searchTerm.trim() ? { name: searchTerm.trim() } : undefined);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchTerm, authLoading]);

  const loadTenants = async (filters?: { name?: string }) => {
    try {
      const data = await tenantsApi.getAll(filters);
      setTenants(data);
    } catch (error) {
      console.error("Failed to load tenants", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTenants = tenants;

  const getStatusLabel = (status: string) => {
    const statusKey = status.toLowerCase() as "active" | "inactive" | "pending";
    return t(`status.${statusKey}`);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t("title")}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <div className="relative mb-8">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder={t("searchPlaceholder")}
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white focus:outline-hidden focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
        </div>
      ) : filteredTenants.length > 0 ? ( // NOSONAR
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
          {filteredTenants.map((tenant) => (
            <div
              key={tenant.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 p-3"
            >
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/${locale}/tenants/${tenant.id}`}
                    data-testid="tenant-detail-link"
                    className="font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-300"
                  >
                    {tenant.firstName} {tenant.lastName}
                  </Link>
                  <p className="text-xs text-gray-500 dark:text-gray-400 break-all">
                    {tenant.email}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {tenant.phone || "-"}
                  </p>
                </div>

                <div className="md:ml-auto flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${
                      tenant.status === "ACTIVE"
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                        : tenant.status === "INACTIVE" // NOSONAR
                          ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
                          : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
                    }`}
                  >
                    {getStatusLabel(tenant.status)}
                  </span>
                  <Link
                    href={`/${locale}/tenants/${tenant.id}/edit`}
                    className="action-link action-link-primary"
                  >
                    <Edit size={14} />
                    {tc("edit")}
                  </Link>
                  <Link
                    href={`/${locale}/tenants/${tenant.id}/payments/new`}
                    className="action-link action-link-success"
                  >
                    <Wallet size={14} />
                    {t("paymentRegistration.submit")}
                  </Link>
                  <Link
                    href={`/${locale}/tenants/${tenant.id}/activities/new`}
                    className="action-link action-link-primary"
                  >
                    <Plus size={14} />
                    {t("activities.add")}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            {t("noTenants")}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("noTenantsDescription")}
          </p>
        </div>
      )}
    </div>
  );
}

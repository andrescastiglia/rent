"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Property, PropertyMaintenanceTask } from "@/types/property";
import { propertiesApi } from "@/lib/api/properties";
import { ownersApi } from "@/lib/api/owners";
import { leasesApi } from "@/lib/api/leases";
import { Owner } from "@/types/owner";
import { Lease } from "@/types/lease";
import {
  Plus,
  Loader2,
  Search,
  Eye,
  Edit,
  Wrench,
  FilePlus,
  FileText,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";

const byMostRecentDate = <T extends { updatedAt: string; createdAt: string }>(
  items: T[],
): T[] =>
  [...items].sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt).getTime() -
      new Date(a.updatedAt || a.createdAt).getTime(),
  );

const toDateAtStartOfDay = (value: string): Date => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const isRentalLeaseExpired = (lease: Lease): boolean => {
  if (lease.contractType !== "rental" || !lease.endDate) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return toDateAtStartOfDay(lease.endDate) < today;
};

type PropertyLeaseAction =
  | { type: "view"; lease: Lease }
  | { type: "renew"; lease: Lease }
  | { type: "none" };

const resolvePropertyLeaseAction = (leases: Lease[]): PropertyLeaseAction => {
  const ordered = byMostRecentDate(leases);

  const draftLease = ordered.find((lease) => lease.status === "DRAFT");
  if (draftLease) {
    return { type: "view", lease: draftLease };
  }

  const activeNonExpired = ordered.find(
    (lease) => lease.status === "ACTIVE" && !isRentalLeaseExpired(lease),
  );
  if (activeNonExpired) {
    return { type: "view", lease: activeNonExpired };
  }

  const expiredRental = ordered.find((lease) => isRentalLeaseExpired(lease));
  if (expiredRental) {
    return { type: "renew", lease: expiredRental };
  }

  if (ordered[0]) {
    return { type: "view", lease: ordered[0] };
  }

  return { type: "none" };
};

const ownerActionClass =
  "action-link action-link-primary whitespace-nowrap px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm";
const propertyPrimaryActionClass =
  "action-link action-link-primary whitespace-nowrap px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm";
const propertySuccessActionClass =
  "action-link action-link-success whitespace-nowrap px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm";

export default function PropertiesPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations("properties");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useLocalizedRouter();

  const [properties, setProperties] = useState<Property[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [leasesByProperty, setLeasesByProperty] = useState<
    Record<string, Lease[]>
  >({});
  const [expandedPropertyId, setExpandedPropertyId] = useState<string | null>(
    null,
  );
  const [maintenanceByProperty, setMaintenanceByProperty] = useState<
    Record<string, PropertyMaintenanceTask[]>
  >({});
  const [loadingMaintenancePropertyId, setLoadingMaintenancePropertyId] =
    useState<string | null>(null);
  const [renewingLeaseId, setRenewingLeaseId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    void loadData();
  }, [authLoading]);

  useEffect(() => {
    if (
      selectedOwnerId &&
      !owners.some((owner) => owner.id === selectedOwnerId)
    ) {
      setSelectedOwnerId(null);
      setExpandedPropertyId(null);
    }
  }, [owners, selectedOwnerId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [propertiesResult, ownersResult] = await Promise.all([
        propertiesApi.getAll(),
        ownersApi.getAll(),
      ]);
      setProperties(propertiesResult);
      setOwners(ownersResult);

      const leaseResults = await Promise.allSettled([
        leasesApi.getAll({ status: "ACTIVE" }),
        leasesApi.getAll({ status: "DRAFT" }),
        leasesApi.getAll({ status: "FINALIZED" }),
      ]);
      const leaseMap = new Map<string, Lease>();
      for (const result of leaseResults) {
        if (result.status !== "fulfilled") continue;
        for (const lease of result.value) {
          leaseMap.set(lease.id, lease);
        }
      }
      if (leaseMap.size === 0) {
        try {
          const fallbackLeases = await leasesApi.getAll({
            includeFinalized: true,
          });
          for (const lease of fallbackLeases) {
            leaseMap.set(lease.id, lease);
          }
        } catch (error) {
          console.warn("Failed to load fallback leases list", error);
        }
      }
      const leases = byMostRecentDate(Array.from(leaseMap.values()));
      const nextLeasesByProperty: Record<string, Lease[]> = {};
      for (const lease of leases) {
        if (!lease.propertyId) continue;
        const list = nextLeasesByProperty[lease.propertyId] ?? [];
        nextLeasesByProperty[lease.propertyId] = [...list, lease];
      }
      setLeasesByProperty(nextLeasesByProperty);
    } catch (error) {
      console.error("Failed to load owner/property data", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredOwners = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return owners.filter((owner) => {
      if (!term) return true;
      const haystack =
        `${owner.firstName} ${owner.lastName} ${owner.email ?? ""} ${owner.phone ?? ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [owners, searchTerm]);

  const propertiesByOwner = useMemo(() => {
    const grouped: Record<string, Property[]> = {};

    for (const owner of owners) {
      grouped[owner.id] = [];
    }

    for (const property of properties) {
      if (!property.ownerId) continue;
      const list = grouped[property.ownerId] ?? [];
      grouped[property.ownerId] = [...list, property];
    }

    for (const ownerId of Object.keys(grouped)) {
      grouped[ownerId] = grouped[ownerId].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    }

    return grouped;
  }, [owners, properties]);

  const handleSelectOwner = (owner: Owner) => {
    setSelectedOwnerId((prev) => (prev === owner.id ? null : owner.id));
    setExpandedPropertyId(null);
  };

  const handleTogglePropertyMaintenance = async (propertyId: string) => {
    if (expandedPropertyId === propertyId) {
      setExpandedPropertyId(null);
      return;
    }

    setExpandedPropertyId(propertyId);
    if (maintenanceByProperty[propertyId]) {
      return;
    }

    setLoadingMaintenancePropertyId(propertyId);
    try {
      const tasks = await propertiesApi.getMaintenanceTasks(propertyId);
      setMaintenanceByProperty((prev) => ({
        ...prev,
        [propertyId]: byMostRecentDate(tasks).slice(0, 5),
      }));
    } catch (error) {
      console.error("Failed to load property maintenance tasks", error);
      setMaintenanceByProperty((prev) => ({ ...prev, [propertyId]: [] }));
    } finally {
      setLoadingMaintenancePropertyId(null);
    }
  };

  const handleRenewLease = async (lease: Lease) => {
    try {
      setRenewingLeaseId(lease.id);
      const renewed = await leasesApi.renew(lease.id);
      await loadData();
      router.push(`/leases/${renewed.id}`);
    } catch (error) {
      console.error("Failed to renew lease", error);
      alert(tc("error"));
    } finally {
      setRenewingLeaseId(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t("ownersTitle")}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {t("ownerListSubtitle")}
          </p>
        </div>
        <Link
          href={`/${locale}/properties/owners/new`}
          className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus size={18} className="mr-2" />
          {t("addOwner")}
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t("ownerListTitle")}
          </h2>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder={t("ownerSearchPlaceholder")}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white focus:outline-hidden focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {filteredOwners.length > 0 ? (
            <div className="space-y-3">
              {filteredOwners.map((owner) => {
                const isSelected = selectedOwnerId === owner.id;
                const ownerProperties = propertiesByOwner[owner.id] ?? [];

                return (
                  <div
                    key={owner.id}
                    className={`rounded-lg border transition ${
                      isSelected
                        ? "border-blue-500 bg-blue-50/60 dark:bg-blue-900/20"
                        : "border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    <div className="w-full p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-left">
                      <button
                        type="button"
                        data-testid="owner-row-main"
                        onClick={() => handleSelectOwner(owner)}
                        className="min-w-0 w-full md:w-auto text-left cursor-pointer"
                      >
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {owner.firstName} {owner.lastName}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 break-all">
                          {owner.email}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {owner.phone || "-"}
                        </p>
                      </button>

                      <div className="flex w-full flex-wrap items-center gap-2 md:ml-auto md:w-auto md:justify-end">
                        <Link
                          href={`/${locale}/properties/new?ownerId=${owner.id}`}
                          className={ownerActionClass}
                        >
                          <Plus size={14} />
                          {t("addProperty")}
                        </Link>
                        <Link
                          href={`/${locale}/properties/owners/${owner.id}/edit`}
                          className={ownerActionClass}
                        >
                          <Edit size={14} />
                          {tc("edit")}
                        </Link>
                        <span className="ml-auto text-gray-400 dark:text-gray-500 md:ml-0">
                          <button
                            type="button"
                            data-testid="owner-row-toggle"
                            onClick={() => handleSelectOwner(owner)}
                            className="inline-flex items-center"
                          >
                            {isSelected ? (
                              <ChevronUp size={16} />
                            ) : (
                              <ChevronDown size={16} />
                            )}
                          </button>
                        </span>
                      </div>
                    </div>

                    {isSelected ? (
                      <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-3 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          {t("ownerAssignedProperties")}
                        </p>

                        {ownerProperties.length > 0 ? (
                          <div className="space-y-2">
                            {ownerProperties.map((property) => {
                              const propertyOperations =
                                property.operations ?? [];
                              const supportsRent =
                                propertyOperations.includes("rent");
                              const supportsSale =
                                propertyOperations.includes("sale");
                              const canCreateContract =
                                supportsRent || supportsSale;
                              const propertyLeases =
                                leasesByProperty[property.id] ?? [];
                              const leaseAction =
                                resolvePropertyLeaseAction(propertyLeases);
                              const createContractQuery = new URLSearchParams({
                                propertyId: property.id,
                                propertyName: property.name,
                              });
                              if (propertyOperations.length > 0) {
                                createContractQuery.set(
                                  "propertyOperations",
                                  propertyOperations.join(","),
                                );
                              }
                              const ownerName =
                                `${owner.firstName} ${owner.lastName}`.trim() ||
                                owner.email ||
                                "";
                              if (ownerName) {
                                createContractQuery.set("ownerName", ownerName);
                              }
                              const createContractHref = `/${locale}/leases/new?${createContractQuery.toString()}`;

                              return (
                                <div
                                  key={property.id}
                                  className={`rounded-md border transition ${
                                    expandedPropertyId === property.id
                                      ? "border-blue-400 bg-blue-50/50 dark:bg-blue-900/10 dark:border-blue-700"
                                      : "border-gray-200 dark:border-gray-700"
                                  }`}
                                >
                                  <div className="w-full p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-left">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleTogglePropertyMaintenance(
                                          property.id,
                                        )
                                      }
                                      className="min-w-0 w-full md:w-auto text-left cursor-pointer"
                                    >
                                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                        {property.name}
                                      </p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400 break-words">
                                        {property.address.street}{" "}
                                        {property.address.number},{" "}
                                        {property.address.city}
                                      </p>
                                    </button>
                                    <div className="flex w-full flex-wrap items-center gap-2 md:ml-auto md:w-auto md:justify-end">
                                      <a
                                        href={`/${locale}/properties/${property.id}`}
                                        data-testid={`property-view-link-${property.id}`}
                                        className={propertyPrimaryActionClass}
                                      >
                                        <Eye size={14} />
                                        {tc("view")}
                                      </a>
                                      <a
                                        href={`/${locale}/properties/${property.id}/edit`}
                                        className={propertyPrimaryActionClass}
                                      >
                                        <Edit size={14} />
                                        {tc("edit")}
                                      </a>
                                      <a
                                        href={`/${locale}/properties/${property.id}/maintenance/new`}
                                        className={propertyPrimaryActionClass}
                                      >
                                        <Wrench size={14} />
                                        {t("saveMaintenanceTask")}
                                      </a>
                                      {leaseAction.type === "view" ? (
                                        <Link
                                          href={`/${locale}/leases/${leaseAction.lease.id}`}
                                          className={propertySuccessActionClass}
                                        >
                                          <FileText size={14} />
                                          {t("viewLease")}
                                        </Link>
                                      ) : leaseAction.type === "renew" ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void handleRenewLease(
                                              leaseAction.lease,
                                            )
                                          }
                                          disabled={
                                            renewingLeaseId ===
                                            leaseAction.lease.id
                                          }
                                          className={`${propertySuccessActionClass} disabled:opacity-60`}
                                        >
                                          {renewingLeaseId ===
                                          leaseAction.lease.id ? (
                                            <Loader2
                                              size={14}
                                              className="animate-spin"
                                            />
                                          ) : (
                                            <RefreshCw size={14} />
                                          )}
                                          {t("renewLease")}
                                        </button>
                                      ) : canCreateContract ? (
                                        <Link
                                          href={createContractHref}
                                          className={propertySuccessActionClass}
                                        >
                                          <FilePlus size={14} />
                                          {t("createLease")}
                                        </Link>
                                      ) : null}
                                      <span className="ml-auto text-gray-400 dark:text-gray-500 md:ml-0">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void handleTogglePropertyMaintenance(
                                              property.id,
                                            )
                                          }
                                          className="inline-flex items-center"
                                        >
                                          {expandedPropertyId ===
                                          property.id ? (
                                            <ChevronUp size={16} />
                                          ) : (
                                            <ChevronDown size={16} />
                                          )}
                                        </button>
                                      </span>
                                    </div>
                                  </div>

                                  {expandedPropertyId === property.id ? (
                                    <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-3 space-y-2">
                                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        {t("recentMaintenanceTasks")}
                                      </p>
                                      {loadingMaintenancePropertyId ===
                                      property.id ? (
                                        <div className="flex items-center py-2 text-sm text-gray-500 dark:text-gray-400">
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                          {tc("loading")}
                                        </div>
                                      ) : (
                                          maintenanceByProperty[property.id] ??
                                          []
                                        ).length > 0 ? (
                                        (
                                          maintenanceByProperty[property.id] ??
                                          []
                                        ).map((task) => (
                                          <div
                                            key={task.id}
                                            className="rounded-md border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                                          >
                                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                                              {task.title}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                              {new Date(
                                                task.scheduledAt,
                                              ).toLocaleString(locale)}
                                            </p>
                                            {task.notes ? (
                                              <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                                                {task.notes}
                                              </p>
                                            ) : null}
                                          </div>
                                        ))
                                      ) : (
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                          {t("noMaintenanceTasks")}
                                        </p>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {t("ownerNoProperties")}
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              <p>{t("noOwners")}</p>
              <p className="mt-1">{t("noOwnersDescription")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

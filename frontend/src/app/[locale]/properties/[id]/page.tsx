"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Property, PropertyMaintenanceTask } from "@/types/property";
import { propertiesApi } from "@/lib/api/properties";
import { leasesApi } from "@/lib/api/leases";
import { Lease } from "@/types/lease";
import {
  Edit,
  ArrowLeft,
  MapPin,
  Building,
  Trash2,
  Loader2,
  FilePlus,
  FileText,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { useAuth } from "@/contexts/auth-context";

export default function PropertyDetailPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations("properties");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const params = useParams();
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useLocalizedRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [maintenanceTasks, setMaintenanceTasks] = useState<
    PropertyMaintenanceTask[]
  >([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [leasesForProperty, setLeasesForProperty] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);
  const [renewingLeaseId, setRenewingLeaseId] = useState<string | null>(null);

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [property?.id, property?.images?.length]);

  const loadLeasesForProperty = useCallback(
    async (id: string): Promise<Lease[]> => {
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

      const candidates = Array.from(leaseMap.values())
        .filter((lease) => lease.propertyId === id)
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime(),
        );

      return candidates;
    },
    [],
  );

  const loadProperty = useCallback(
    async (id: string) => {
      try {
        const [data, visitData, leaseData] = await Promise.all([
          propertiesApi.getById(id),
          propertiesApi.getMaintenanceTasks(id),
          loadLeasesForProperty(id),
        ]);
        setProperty(data);
        setMaintenanceTasks(visitData);
        setLeasesForProperty(leaseData);
      } catch (error) {
        console.error("Failed to load property", error);
      } finally {
        setLoading(false);
      }
    },
    [loadLeasesForProperty],
  );

  useEffect(() => {
    if (authLoading) return;
    if (propertyId) {
      loadProperty(propertyId).catch((error) => {
        console.error("Failed to load property", error);
      });
    }
  }, [propertyId, authLoading, loadProperty]);

  const handleDelete = async () => {
    if (!property || !confirm(t("confirmDelete"))) return;

    try {
      await propertiesApi.delete(property.id);
      router.push("/properties");
    } catch (error) {
      console.error("Failed to delete property", error);
      alert(tCommon("error"));
    }
  };

  const isRentalLeaseExpired = (lease: Lease): boolean => {
    if (lease.contractType !== "rental" || !lease.endDate) {
      return false;
    }
    const endDate = new Date(lease.endDate);
    endDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return endDate < today;
  };

  const resolveLeaseAction = (
    leases: Lease[],
  ):
    | { type: "view"; lease: Lease }
    | { type: "renew"; lease: Lease }
    | { type: "none" } => {
    const ordered = [...leases].sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime(),
    );

    const draft = ordered.find((lease) => lease.status === "DRAFT");
    if (draft) return { type: "view", lease: draft };

    const activeNonExpired = ordered.find(
      (lease) => lease.status === "ACTIVE" && !isRentalLeaseExpired(lease),
    );
    if (activeNonExpired) return { type: "view", lease: activeNonExpired };

    const expiredRental = ordered.find((lease) => isRentalLeaseExpired(lease));
    if (expiredRental) return { type: "renew", lease: expiredRental };

    if (ordered[0]) return { type: "view", lease: ordered[0] };
    return { type: "none" };
  };

  const handleRenewLease = async (lease: Lease) => {
    if (!propertyId) return;
    try {
      setRenewingLeaseId(lease.id);
      const renewed = await leasesApi.renew(lease.id);
      await loadProperty(propertyId);
      router.push(`/leases/${renewed.id}`);
    } catch (error) {
      console.error("Failed to renew lease from property detail", error);
      alert(tCommon("error"));
    } finally {
      setRenewingLeaseId(null);
    }
  };

  const getStatusLabel = (status: string) => {
    const statusKey = status.toLowerCase() as
      | "active"
      | "inactive"
      | "maintenance";
    return t(`status.${statusKey}`);
  };

  const getTypeLabel = (type: string) => {
    const typeKey = type.toLowerCase() as
      | "apartment"
      | "house"
      | "commercial"
      | "office"
      | "other";
    return t(`type.${typeKey}`);
  };

  const getOperationStateLabel = (state?: string) => {
    const stateKey = (state ?? "available").toLowerCase() as
      | "available"
      | "rented"
      | "reserved"
      | "sold";
    return t(`operationState.${stateKey}`);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("notFound")}
        </h1>
        <Link
          href={`/${locale}/properties`}
          className="text-blue-600 hover:underline mt-4 inline-block"
        >
          {t("backToList")}
        </Link>
      </div>
    );
  }

  const propertyOperations = property.operations ?? [];
  const supportsRent = propertyOperations.includes("rent");
  const supportsSale = propertyOperations.includes("sale");
  const canCreateLease = supportsRent || supportsSale;
  const leaseAction = resolveLeaseAction(leasesForProperty);
  const createLeaseQuery = new URLSearchParams({
    propertyId: property.id,
    propertyName: property.name,
  });
  if (propertyOperations.length > 0) {
    createLeaseQuery.set("propertyOperations", propertyOperations.join(","));
  }
  const createLeaseHref = `/${locale}/leases/new?${createLeaseQuery.toString()}`;
  const hasMultipleImages = property.images.length > 1;
  const currentImage = property.images[currentImageIndex] ?? property.images[0];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/${locale}/properties`}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft size={16} className="mr-1" />
          {t("backToList")}
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xs border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="relative h-64 md:h-96 bg-gray-200 dark:bg-gray-700">
          {currentImage ? (
            <Image
              src={currentImage}
              alt={property.name}
              fill
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <Building size={64} />
            </div>
          )}
          {hasMultipleImages && (
            <>
              <button
                type="button"
                onClick={() =>
                  setCurrentImageIndex(
                    (prev) =>
                      (prev - 1 + property.images.length) %
                      property.images.length,
                  )
                }
                className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-black/45 text-white rounded-full hover:bg-black/65 transition-colors"
                aria-label={t("previousImage")}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() =>
                  setCurrentImageIndex(
                    (prev) => (prev + 1) % property.images.length,
                  )
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-black/45 text-white rounded-full hover:bg-black/65 transition-colors"
                aria-label={t("nextImage")}
              >
                <ChevronRight size={18} />
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/45 text-white text-xs px-2 py-1 rounded-sm">
                {currentImageIndex + 1} / {property.images.length}
              </div>
            </>
          )}
          <div className="absolute top-4 right-4 flex space-x-2">
            <Link
              href={`/${locale}/properties/${property.id}/edit`}
              className="p-2 bg-white/90 backdrop-blur-xs rounded-full text-gray-700 hover:text-blue-600 shadow-xs transition-colors"
              aria-label={tCommon("edit")}
            >
              <Edit size={20} />
            </Link>
            <button
              onClick={handleDelete}
              className="p-2 bg-white/90 backdrop-blur-xs rounded-full text-gray-700 hover:text-red-600 shadow-xs transition-colors"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`px-2 py-1 rounded text-xs font-semibold text-white uppercase tracking-wide ${
                    property.status === "ACTIVE"
                      ? "bg-green-500"
                      : property.status === "MAINTENANCE"
                        ? "bg-yellow-500"
                        : "bg-red-500"
                  }`}
                >
                  {getStatusLabel(property.status)}
                </span>
                <span className="px-2 py-1 rounded-sm text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  {getTypeLabel(property.type)}
                </span>
                <span className="px-2 py-1 rounded-sm text-xs font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                  {getOperationStateLabel(property.operationState)}
                </span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                {property.name}
              </h1>
              <div className="flex items-center text-gray-500 dark:text-gray-400">
                <MapPin size={18} className="mr-1" />
                <span>
                  {property.address.street} {property.address.number},{" "}
                  {property.address.city}, {property.address.state}
                </span>
              </div>
            </div>
            <div className="text-right">
              {leaseAction.type === "view" ? (
                <Link
                  href={`/${locale}/leases/${leaseAction.lease.id}`}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
                >
                  <FileText size={16} />
                  {t("viewLease")}
                </Link>
              ) : leaseAction.type === "renew" ? (
                <button
                  type="button"
                  onClick={() => {
                    handleRenewLease(leaseAction.lease).catch((error) => {
                      console.error(
                        "Failed to renew lease from property detail",
                        error,
                      );
                    });
                  }}
                  disabled={renewingLeaseId === leaseAction.lease.id}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-70"
                >
                  {renewingLeaseId === leaseAction.lease.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  {t("renewLease")}
                </button>
              ) : canCreateLease ? (
                <Link
                  href={createLeaseHref}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
                >
                  <FilePlus size={16} />
                  {t("createLease")}
                </Link>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-8">
              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                  {t("description")}
                </h2>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                  {property.description || t("noDescription")}
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                  {t("features")}
                </h2>
                {property.features.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {property.features.map((feature) => (
                      <div
                        key={feature.id}
                        className="flex items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                      >
                        <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                        <span className="text-gray-700 dark:text-gray-300 font-medium">
                          {feature.name}
                        </span>
                        {feature.value && (
                          <span className="ml-1 text-gray-500 dark:text-gray-400 text-sm">
                            ({feature.value})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">
                    {t("noFeatures")}
                  </p>
                )}
              </section>

              <section id="maintenance-tasks">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {t("maintenanceTasks")}
                  </h2>
                  <Link
                    href={`/${locale}/properties/${property.id}/maintenance/new`}
                    className="inline-flex items-center px-3 py-2 rounded-md border border-blue-300 dark:border-blue-700 text-sm text-blue-700 dark:text-blue-300"
                  >
                    {t("saveMaintenanceTask")}
                  </Link>
                </div>

                <div className="mt-6 space-y-4">
                  {maintenanceTasks.length > 0 ? (
                    maintenanceTasks.map((task) => (
                      <div
                        key={task.id}
                        className="border border-gray-100 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {task.title}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {new Date(task.scheduledAt).toLocaleString()}
                          </p>
                        </div>
                        {task.notes && (
                          <p className="text-gray-600 dark:text-gray-300 mb-2">
                            {task.notes}
                          </p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 dark:text-gray-400 italic">
                      {t("noMaintenanceTasks")}
                    </p>
                  )}
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg border border-gray-100 dark:border-gray-600">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
                  {t("pricingTitle")}
                </h3>
                <dl className="space-y-3">
                  {supportsRent ? (
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-gray-400">
                        {t("fields.rentPrice")}
                      </dt>
                      <dd className="font-medium text-gray-900 dark:text-white">
                        {property.rentPrice !== undefined
                          ? property.rentPrice.toLocaleString(locale)
                          : "-"}
                      </dd>
                    </div>
                  ) : null}
                  {supportsSale ? (
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-gray-400">
                        {t("fields.salePrice")}
                      </dt>
                      <dd className="font-medium text-gray-900 dark:text-white">
                        {property.salePrice !== undefined
                          ? `${property.salePrice.toLocaleString(locale)}${property.saleCurrency ? ` ${property.saleCurrency}` : ""}`
                          : "-"}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg border border-gray-100 dark:border-gray-600">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
                  {t("ownerContact")}
                </h3>
                <dl className="space-y-3">
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">
                      {t("fields.ownerWhatsapp")}
                    </dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {property.ownerWhatsapp || t("noOwnerWhatsapp")}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg border border-gray-100 dark:border-gray-600">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
                  {t("propertyStats")}
                </h3>
                <dl className="space-y-3">
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">
                      {t("totalUnits")}
                    </dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {property.units.length}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">
                      {t("occupied")}
                    </dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {
                        property.units.filter((u) => u.status === "OCCUPIED")
                          .length
                      }
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">
                      {t("vacant")}
                    </dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {
                        property.units.filter((u) => u.status === "AVAILABLE")
                          .length
                      }
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

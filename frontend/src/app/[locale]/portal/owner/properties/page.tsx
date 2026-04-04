"use client";

import { useAuth } from "@/contexts/auth-context";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { propertiesApi } from "@/lib/api/properties";
import { Property } from "@/types/property";
import { formatMoneyByCode } from "@/lib/format-money";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Building2, ChevronRight, Loader2 } from "lucide-react";

export default function OwnerPropertiesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useLocalizedRouter();
  const locale = useLocale();
  const t = useTranslations("ownerPortal");

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && user && user.role !== "owner") {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  const fetchProperties = useCallback(async () => {
    try {
      setLoading(true);
      const data = await propertiesApi.getAll();
      setProperties(data);
    } catch (error) {
      console.error("Error fetching owner properties:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user?.role === "owner") {
      fetchProperties();
    }
  }, [authLoading, user, fetchProperties]);

  if (authLoading || loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (user?.role !== "owner") return null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">
        {t("myProperties")}
      </h1>

      {properties.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
          <Building2 className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-sm">{t("noProperties")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {properties.map((property) => {
            const address = property.address?.street
              ? `${property.address.street} ${property.address.number ?? ""}`.trim()
              : property.name;
            const city = property.address?.city ?? "";
            const isRented = property.operationState === "rented";
            const rentPrice = property.rentPrice
              ? formatMoneyByCode(Number(property.rentPrice), "ARS", locale)
              : "-";

            return (
              <Link
                key={property.id}
                href={`/${locale}/properties/${property.id}`}
                className="block bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {address}
                    </p>
                    {city && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {city}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          isRented
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                        }`}
                      >
                        {isRented ? t("rented") : t("available")}
                      </span>
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        {rentPrice}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400 shrink-0 mt-1" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

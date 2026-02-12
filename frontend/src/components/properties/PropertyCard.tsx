"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Property } from "@/types/property";
import { Building, MapPin, Bed, Bath, Ruler } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

interface PropertyCardProps {
  property: Property;
}

export function PropertyCard({ property }: PropertyCardProps) {
  const t = useTranslations("properties");
  const locale = useLocale();
  const operations = property.operations ?? [];
  const showsRent = operations.includes("rent");
  const showsSale = operations.includes("sale");

  return (
    <Link href={`/${locale}/properties/${property.id}`} className="block group">
      <div className="bg-white rounded-lg shadow-md overflow-hidden transition-transform duration-300 group-hover:-translate-y-1 group-hover:shadow-lg border border-gray-100">
        <div className="relative h-48 bg-gray-200">
          {property.images.length > 0 ? (
            <Image
              src={property.images[0]}
              alt={property.name}
              fill
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <Building size={48} />
            </div>
          )}
          <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-xs px-2 py-1 rounded-sm text-xs font-semibold text-gray-700 uppercase tracking-wide">
            {t(`types.${property.type}`)}
          </div>
          <div
            className={`absolute top-2 left-2 px-2 py-1 rounded text-xs font-semibold text-white uppercase tracking-wide ${
              property.status === "ACTIVE"
                ? "bg-green-500"
                : property.status === "MAINTENANCE"
                  ? "bg-yellow-500"
                  : "bg-red-500"
            }`}
          >
            {t(`status.${property.status}`)}
          </div>
        </div>

        <div className="p-4">
          <h3 className="text-lg font-bold text-gray-900 mb-1 truncate">
            {property.name}
          </h3>

          <div className="flex items-center text-gray-500 text-sm mb-3">
            <MapPin size={14} className="mr-1" />
            <span className="truncate">
              {property.address.street} {property.address.number},{" "}
              {property.address.city}
            </span>
          </div>

          <div className="mb-3">
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
              {t(`operationState.${property.operationState ?? "available"}`)}
            </span>
          </div>

          {(showsRent || showsSale) && (
            <div className="mb-3 space-y-1">
              {showsRent ? (
                <p className="text-xs text-gray-600">
                  <span className="font-medium">{t("fields.rentPrice")}:</span>{" "}
                  {property.rentPrice !== undefined
                    ? property.rentPrice.toLocaleString(locale)
                    : "-"}
                </p>
              ) : null}
              {showsSale ? (
                <p className="text-xs text-gray-600">
                  <span className="font-medium">{t("fields.salePrice")}:</span>{" "}
                  {property.salePrice !== undefined
                    ? `${property.salePrice.toLocaleString(locale)}${property.saleCurrency ? ` ${property.saleCurrency}` : ""}`
                    : "-"}
                </p>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 py-3 border-t border-gray-100">
            <div className="flex flex-col items-center justify-center text-gray-600">
              <div className="flex items-center text-sm font-medium">
                <Bed size={16} className="mr-1 text-blue-500" />
                <span>
                  {property.units.reduce((acc, unit) => acc + unit.bedrooms, 0)}
                </span>
              </div>
              <span className="text-[10px] uppercase text-gray-400">
                {t("labels.beds")}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center text-gray-600">
              <div className="flex items-center text-sm font-medium">
                <Bath size={16} className="mr-1 text-blue-500" />
                <span>
                  {property.units.reduce(
                    (acc, unit) => acc + unit.bathrooms,
                    0,
                  )}
                </span>
              </div>
              <span className="text-[10px] uppercase text-gray-400">
                {t("labels.baths")}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center text-gray-600">
              <div className="flex items-center text-sm font-medium">
                <Ruler size={16} className="mr-1 text-blue-500" />
                <span>
                  {property.units.reduce((acc, unit) => acc + unit.area, 0)}
                </span>
              </div>
              <span className="text-[10px] uppercase text-gray-400">m²</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

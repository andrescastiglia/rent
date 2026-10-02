"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Building2, LayoutGrid, List, Plus } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { isInternalUser } from "@/lib/permissions";
import { propertiesApi } from "@/lib/api/properties";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatMoneyByCode } from "@/lib/format-money";
import { PropertyCard } from "@/components/properties/PropertyCard";
import {
  Button,
  DataTable,
  FilterBar,
  FormField,
  PageHeader,
  Pagination,
  StatePanel,
  StatusBadge,
} from "@/components/ui";
import type { Property, PropertyFilters } from "@/types/property";

type Filters = {
  search: string;
  city: string;
  operation: NonNullable<PropertyFilters["operation"]> | "";
  state: NonNullable<PropertyFilters["operationState"]> | "";
  order: NonNullable<PropertyFilters["order"]>;
  page: number;
  view: "list" | "photos";
};
const INITIAL: Filters = {
  search: "",
  city: "",
  operation: "",
  state: "",
  order: "newest",
  page: 1,
  view: "list",
};
const PAGE_SIZE = 20;
function readContext(): Filters {
  const query = new URLSearchParams(window.location.search);
  const page = Number(query.get("page"));
  const operation = query.get("operation");
  const state = query.get("state");
  return {
    search: query.get("search") ?? "",
    city: query.get("city") ?? "",
    operation:
      operation === "rent" || operation === "sale" || operation === "both"
        ? operation
        : "",
    state:
      state === "available" ||
      state === "rented" ||
      state === "reserved" ||
      state === "sold"
        ? state
        : "",
    order: query.get("order") === "address" ? "address" : "newest",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    view: query.get("view") === "photos" ? "photos" : "list",
  };
}

export default function PropertiesPage() {
  const { loading: authLoading, user } = useAuth();
  const locale = useLocale();
  const t = useTranslations("propertyList");
  const tp = useTranslations("properties");
  const [filters, setFilters] = useState<Filters>(INITIAL);
  const [contextReady, setContextReady] = useState(false);
  const [items, setItems] = useState<Property[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const search = useDebouncedValue(filters.search);
  const city = useDebouncedValue(filters.city);

  useEffect(() => {
    const restore = () => setFilters(readContext());
    restore();
    setContextReady(true);
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useEffect(() => {
    if (!contextReady || authLoading) return;
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== INITIAL[key as keyof Filters])
        query.set(key, String(value));
    }
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + (query.size ? "?" + query.toString() : ""),
    );
  }, [contextReady, filters, authLoading]);

  useEffect(() => {
    if (!contextReady || authLoading) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    propertiesApi
      .getPage({
        search: search || undefined,
        addressCity: city || undefined,
        operation: filters.operation || undefined,
        operationState: filters.state || undefined,
        order: filters.order,
        page: filters.page,
        limit: PAGE_SIZE,
      })
      .then((result) => {
        if (!cancelled) {
          setItems(result.data);
          setTotal(result.total);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    contextReady,
    search,
    city,
    filters.operation,
    filters.state,
    filters.order,
    filters.page,
    revision,
  ]);

  const update = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((previous) => ({
      ...previous,
      [key]: value,
      page: key === "page" || key === "view" ? previous.page : 1,
    }));
  const location = (property: Property) =>
    `${property.address.street} ${property.address.number}, ${property.address.city}`;
  const details = (property: Property) => (
    <Link
      className="action-link action-link-primary"
      data-guide="property-open"
      href={`/${locale}/properties/${property.id}`}
    >
      {t("view")}
    </Link>
  );
  const status = (property: Property) => (
    <StatusBadge
      tone={property.operationState === "available" ? "success" : "neutral"}
    >
      {tp(`operationState.${property.operationState ?? "available"}`)}
    </StatusBadge>
  );

  let panelContent1;
  if (error) {
    panelContent1 = (
      <StatePanel
        error
        title={t("error")}
        action={
          <Button
            variant="secondary"
            onClick={() => setRevision((value) => value + 1)}
          >
            {t("retry")}
          </Button>
        }
      />
    );
  } else if (loading) {
    panelContent1 = <StatePanel busy title={t("loading")} />;
  } else {
    panelContent1 = (
      <>
        {filters.view === "photos" && items.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <PropertyCard key={item.id} property={item} />
            ))}
          </div>
        ) : (
          <DataTable
            items={items}
            rowKey={(item) => item.id}
            caption={t("title")}
            emptyTitle={t("empty")}
            columns={[
              {
                key: "name",
                title: t("name"),
                render: (property) => (
                  <div className="flex items-center gap-3">
                    <Building2
                      size={20}
                      className="shrink-0 text-muted"
                      aria-hidden="true"
                    />
                    <span className="font-semibold">{property.name}</span>
                  </div>
                ),
              },
              { key: "address", title: t("location"), render: location },
              { key: "state", title: t("state"), render: status },
              {
                key: "price",
                title: t("price"),
                align: "right",
                render: (property) =>
                  property.salePrice === undefined
                    ? "—"
                    : formatMoneyByCode(
                        property.salePrice,
                        property.saleCurrency ?? "ARS",
                        locale,
                      ),
              },
              { key: "action", title: t("view"), render: details },
            ]}
            renderMobileSummary={(property) => (
              <div className="space-y-2">
                <p className="font-semibold">{property.name}</p>
                <p className="text-sm text-muted">{location(property)}</p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {status(property)}
                  {details(property)}
                </div>
              </div>
            )}
          />
        )}
        <Pagination
          page={filters.page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={(page) =>
            setFilters((previous) => ({ ...previous, page }))
          }
        />
      </>
    );
  }
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Link className="btn btn-secondary" href={`/${locale}/owners`}>
              {t("owners")}
            </Link>
            {isInternalUser(user) && (
              <Link
                className="btn btn-primary"
                href={`/${locale}/properties/new`}
              >
                <Plus size={18} aria-hidden="true" />
                {t("new")}
              </Link>
            )}
          </>
        }
      />
      <FilterBar>
        <FormField id="properties-search" label={t("search")}>
          {(attributes) => (
            <input
              {...attributes}
              type="search"
              className="ui-field"
              value={filters.search}
              onChange={(event) => update("search", event.target.value)}
            />
          )}
        </FormField>
        <FormField id="property-operation" label={t("operation")}>
          {(attributes) => (
            <select
              {...attributes}
              className="ui-field"
              value={filters.operation}
              onChange={(event) =>
                update("operation", event.target.value as Filters["operation"])
              }
            >
              <option value="">{t("all")}</option>
              {["rent", "sale", "both"].map((value) => (
                <option key={value} value={value}>
                  {t(value)}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField id="property-state" label={t("state")}>
          {(attributes) => (
            <select
              {...attributes}
              className="ui-field"
              value={filters.state}
              onChange={(event) =>
                update("state", event.target.value as Filters["state"])
              }
            >
              <option value="">{t("all")}</option>
              {["available", "rented", "reserved", "sold"].map((value) => (
                <option key={value} value={value}>
                  {tp(`operationState.${value}`)}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField id="property-city" label={t("city")}>
          {(attributes) => (
            <input
              {...attributes}
              className="ui-field"
              value={filters.city}
              onChange={(event) => update("city", event.target.value)}
            />
          )}
        </FormField>
        <FormField id="property-order" label={t("order")}>
          {(attributes) => (
            <select
              {...attributes}
              className="ui-field"
              value={filters.order}
              onChange={(event) =>
                update("order", event.target.value as Filters["order"])
              }
            >
              <option value="newest">{t("newest")}</option>
              <option value="address">{t("address")}</option>
            </select>
          )}
        </FormField>
        <fieldset className="flex items-end gap-2">
          <legend className="sr-only">{t("ready")}</legend>
          <Button
            variant="secondary"
            aria-pressed={filters.view === "list"}
            onClick={() => update("view", "list")}
          >
            <List size={16} aria-hidden="true" />
            {t("list")}
          </Button>
          <Button
            variant="secondary"
            aria-pressed={filters.view === "photos"}
            onClick={() => update("view", "photos")}
          >
            <LayoutGrid size={16} aria-hidden="true" />
            {t("photos")}
          </Button>
        </fieldset>
      </FilterBar>
      {panelContent1}
    </div>
  );
}

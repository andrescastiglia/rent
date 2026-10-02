"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { leasesApi } from "@/lib/api/leases";
import type { Lease } from "@/types/lease";
import type { PageResult } from "@/lib/pagination";
import { useAuth } from "@/contexts/auth-context";
import { canManageLeasesForUser } from "@/lib/permissions";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatMoneyByCode } from "@/lib/format-money";
import { formatCalendarDate } from "@/lib/calendar-date";
import {
  Button,
  DataTable,
  FormField,
  PageHeader,
  Pagination,
  StatePanel,
  StatusBadge,
  Surface,
} from "@/components/ui";

function renewalLabel(
  lease: Lease,
  t: (key: string) => string,
  locale: string,
) {
  if (!lease.endDate) return t("noEndDate");
  const end = new Date(`${lease.endDate.slice(0, 10)}T23:59:59-03:00`),
    now = new Date();
  if (end.getTime() < now.getTime()) return t("expired");
  if (
    end.getFullYear() === now.getFullYear() &&
    end.getMonth() === now.getMonth()
  )
    return t("expiresThisMonth");
  return formatCalendarDate(lease.endDate, locale, { dateStyle: "medium" });
}
function LeaseMobileRow({
  lease,
  locale,
}: Readonly<{ lease: Lease; locale: string }>) {
  const t = useTranslations("leaseWorkspace");
  return (
    <div className="space-y-2">
      <Link
        className="font-medium underline"
        href={`/${locale}/leases/${lease.id}`}
      >
        {lease.property?.name || t("unnamedProperty")}
      </Link>
      <p className="text-sm text-muted">
        {[lease.tenant?.firstName, lease.tenant?.lastName]
          .filter(Boolean)
          .join(" ") || t("noTenant")}
      </p>
      <p className="text-sm">
        {t("end")}: {renewalLabel(lease, t, locale)}
      </p>
      <p className="tabular-nums font-medium">
        {lease.rentAmount === undefined
          ? "—"
          : formatMoneyByCode(lease.rentAmount, lease.currency, locale)}
      </p>
      <StatusBadge>{t(lease.status.toLowerCase())}</StatusBadge>
    </div>
  );
}
export default function LeasesPage() {
  const { loading: authLoading, user } = useAuth();
  const t = useTranslations("leaseWorkspace"),
    locale = useLocale();
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState<Lease["status"] | "">(""),
    [page, setPage] = useState(1);
  const [result, setResult] = useState<PageResult<Lease>>({
    data: [],
    total: 0,
    page: 1,
    limit: 20,
  });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [revision, setRevision] = useState(0);
  const term = useDebouncedValue(search);
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    leasesApi
      .getPage({
        page,
        limit: 20,
        propertyAddress: term.trim() || undefined,
        status: status || undefined,
        includeFinalized: true,
        contractType: "rental",
      })
      .then((next) => {
        if (!cancelled) setResult(next);
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
  }, [authLoading, term, status, page, revision]);
  const actions = canManageLeasesForUser(user) ? (
    <>
      <Link className="btn btn-secondary" href={`/${locale}/leases/import`}>
        {t("import")}
      </Link>
      <Link className="btn btn-primary" href={`/${locale}/leases/new`}>
        {t("new")}
      </Link>
    </>
  ) : undefined;
  let content = <StatePanel busy title={t("loading")} />;
  if (error)
    content = (
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
  else if (!loading)
    content =
      result.data.length === 0 ? (
        <StatePanel title={t("empty")} />
      ) : (
        <DataTable
          items={result.data}
          caption={t("title")}
          emptyTitle={t("empty")}
          rowKey={(lease) => lease.id}
          columns={[
            {
              key: "property",
              title: t("property"),
              render: (lease) => (
                <Link
                  className="font-medium underline"
                  href={`/${locale}/leases/${lease.id}`}
                >
                  {lease.property?.name || t("unnamedProperty")}
                </Link>
              ),
            },
            {
              key: "tenant",
              title: t("tenant"),
              render: (lease) =>
                [lease.tenant?.firstName, lease.tenant?.lastName]
                  .filter(Boolean)
                  .join(" ") || t("noTenant"),
            },
            {
              key: "end",
              title: t("end"),
              render: (lease) => renewalLabel(lease, t, locale),
            },
            {
              key: "rent",
              title: t("rent"),
              align: "right",
              render: (lease) =>
                lease.rentAmount === undefined
                  ? "—"
                  : formatMoneyByCode(lease.rentAmount, lease.currency, locale),
            },
            {
              key: "status",
              title: t("status"),
              render: (lease) => (
                <StatusBadge>{t(lease.status.toLowerCase())}</StatusBadge>
              ),
            },
          ]}
          renderMobileSummary={(lease) => (
            <LeaseMobileRow lease={lease} locale={locale} />
          )}
        />
      );
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={actions}
      />
      <Surface className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="leases-search" label={t("search")}>
            {(attributes) => (
              <input
                {...attributes}
                className="ui-field"
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            )}
          </FormField>
          <FormField id="leases-status" label={t("status")}>
            {(attributes) => (
              <select
                {...attributes}
                className="ui-field"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as Lease["status"] | "");
                  setPage(1);
                }}
              >
                <option value="">{t("all")}</option>
                {["DRAFT", "ACTIVE", "FINALIZED"].map((value) => (
                  <option key={value} value={value}>
                    {t(value.toLowerCase())}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>
        {content}
        {!loading && !error && (
          <Pagination
            total={result.total}
            page={result.page}
            pageSize={result.limit}
            onPageChange={setPage}
          />
        )}
      </Surface>
    </div>
  );
}

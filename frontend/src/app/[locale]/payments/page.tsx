"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { paymentsApi } from "@/lib/api/payments";
import { ownersApi } from "@/lib/api/owners";
import { useAuth } from "@/contexts/auth-context";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatMoneyByCode } from "@/lib/format-money";
import { PaymentStatusBadge } from "@/components/payments/PaymentStatusBadge";
import {
  Button,
  DataTable,
  FilterBar,
  FormField,
  PageHeader,
  Pagination,
  StatePanel,
  Surface,
} from "@/components/ui";
import type {
  Payment,
  PaymentActivityType,
  PaymentStatus,
} from "@/types/payment";
import type { OwnerSettlementSummary } from "@/types/owner";

const PAGE_SIZE = 20;
const activityTypes: readonly PaymentActivityType[] = [
  "monthly",
  "annual",
  "adjustment",
  "late_fee",
  "extraordinary",
];
function context(payment: Payment) {
  const lease = payment.tenantAccount?.lease;
  return {
    property: lease?.property?.name ?? "—",
    tenant:
      `${lease?.tenant?.firstName ?? ""} ${lease?.tenant?.lastName ?? ""}`.trim() ||
      "—",
    leaseId: lease?.id,
  };
}

export default function PaymentsPage() {
  const { loading: authLoading } = useAuth();
  const locale = useLocale();
  const t = useTranslations("paymentList");
  const tp = useTranslations("payments");
  const [items, setItems] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PaymentStatus | "">("");
  const [activity, setActivity] = useState<PaymentActivityType | "">("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [settlements, setSettlements] = useState<OwnerSettlementSummary[]>([]);
  const [settlementError, setSettlementError] = useState(false);
  const [showSettlements, setShowSettlements] = useState(false);
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    paymentsApi
      .getAll({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        status: status || undefined,
        activityType: activity || undefined,
      })
      .then((result) => {
        if (!cancelled) {
          setItems(result.data);
          setTotal(result.total);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, page, status, activity, debouncedSearch, revision]);
  useEffect(() => {
    if (!showSettlements) return;
    let cancelled = false;
    setSettlementError(false);
    ownersApi
      .listSettlementPayments(50)
      .then((result) => {
        if (!cancelled) setSettlements(result);
      })
      .catch(() => {
        if (!cancelled) setSettlementError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [showSettlements, revision]);
  const detail = (payment: Payment) => (
    <Link
      data-guide="payment-open"
      href={`/${locale}/payments/${payment.id}`}
      className="action-link action-link-primary"
    >
      {t("detail")}
    </Link>
  );
  const amount = (payment: Payment) =>
    formatMoneyByCode(payment.amount, payment.currencyCode, locale);
  const date = (payment: Payment) =>
    new Date(
      `${payment.paymentDate.slice(0, 10)}T12:00:00Z`,
    ).toLocaleDateString(locale, {
      timeZone: "America/Argentina/Buenos_Aires",
    });

  let panelContent1;
  if (failed) {
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
        <p className="text-sm text-muted">{t("total", { total })}</p>
        <DataTable
          items={items}
          rowKey={(payment) => payment.id}
          caption={t("title")}
          emptyTitle={t("empty")}
          columns={[
            {
              key: "property",
              title: t("property"),
              render: (payment) => (
                <>
                  <p className="font-semibold">{context(payment).property}</p>
                  <p className="text-xs text-muted">
                    {context(payment).tenant}
                  </p>
                </>
              ),
            },
            {
              key: "reference",
              title: t("reference"),
              render: (payment) =>
                payment.receipt?.receiptNumber ?? payment.reference ?? "—",
            },
            {
              key: "activity",
              title: t("activity"),
              render: (payment) => t(`activityLabels.${payment.activityType}`),
            },
            {
              key: "status",
              title: t("status"),
              render: (payment) => (
                <PaymentStatusBadge status={payment.status} />
              ),
            },
            {
              key: "amount",
              title: t("amount"),
              align: "right",
              render: amount,
            },
            { key: "date", title: t("date"), render: date },
            { key: "detail", title: t("detail"), render: detail },
          ]}
          renderMobileSummary={(payment) => (
            <div className="space-y-2">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-semibold">{context(payment).property}</p>
                <p className="font-semibold tabular-nums">{amount(payment)}</p>
              </div>
              <p className="text-sm text-muted">
                {context(payment).tenant} · {date(payment)}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <PaymentStatusBadge status={payment.status} />
                {detail(payment)}
              </div>
            </div>
          )}
        />
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
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
          <Link className="btn btn-primary" href={`/${locale}/payments/new`}>
            {t("new")}
          </Link>
        }
      />
      <FilterBar>
        <FormField id="payments-search" label={t("search")}>
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
        <FormField id="payments-status" label={t("status")}>
          {(attributes) => (
            <select
              {...attributes}
              className="ui-field"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as PaymentStatus | "");
                setPage(1);
              }}
            >
              <option value="">{t("all")}</option>
              {[
                "pending",
                "processing",
                "completed",
                "failed",
                "refunded",
                "cancelled",
              ].map((value) => (
                <option key={value} value={value}>
                  {tp(`status.${value}`)}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField id="payments-activity" label={t("activity")}>
          {(attributes) => (
            <select
              {...attributes}
              className="ui-field"
              value={activity}
              onChange={(event) => {
                setActivity(event.target.value as PaymentActivityType | "");
                setPage(1);
              }}
            >
              <option value="">{t("all")}</option>
              {activityTypes.map((value) => (
                <option key={value} value={value}>
                  {t(`activityLabels.${value}`)}
                </option>
              ))}
            </select>
          )}
        </FormField>
      </FilterBar>
      {panelContent1}
      <Surface className="p-4">
        <Button
          variant="secondary"
          aria-expanded={showSettlements}
          onClick={() => setShowSettlements((value) => !value)}
        >
          {t("settlements")}
        </Button>
        {showSettlements && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted">{t("recentSettlements")}</p>
            {settlementError ? (
              <StatePanel
                error
                title={t("error")}
                action={
                  <Button onClick={() => setRevision((value) => value + 1)}>
                    {t("retry")}
                  </Button>
                }
              />
            ) : (
              settlements.map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3"
                >
                  <p>
                    {payment.ownerName} · {payment.period}
                  </p>
                  <p className="font-semibold tabular-nums">
                    {formatMoneyByCode(
                      payment.netAmount,
                      payment.currencyCode,
                      locale,
                    )}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </Surface>
    </div>
  );
}

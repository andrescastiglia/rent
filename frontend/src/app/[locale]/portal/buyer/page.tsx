"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { hasUserRole } from "@/lib/permissions";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { salesApi } from "@/lib/api/sales";
import {
  Button,
  FormField,
  PageHeader,
  Pagination,
  StatePanel,
  Surface,
} from "@/components/ui";
import SaleDetailPanel from "@/components/sales/SaleDetailPanel";
import type { SaleAgreement } from "@/types/sales";

export default function BuyerPortalPage() {
  const { user, logout } = useAuth();
  const t = useTranslations("buyerPortal");
  const [items, setItems] = useState<SaleAgreement[]>([]);
  const [selected, setSelected] = useState<SaleAgreement>();
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const term = useDebouncedValue(search);
  const allowed = hasUserRole(user, "buyer");
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    salesApi
      .getAgreementPage({ page, limit: 20, search: term })
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
  }, [allowed, page, term, revision]);
  if (!allowed) return <StatePanel error title={t("unavailable")} />;
  let content;
  if (error)
    content = (
      <StatePanel
        error
        title={t("error")}
        action={
          <Button onClick={() => setRevision((value) => value + 1)}>
            {t("retry")}
          </Button>
        }
      />
    );
  else if (loading) content = <StatePanel busy title={t("loading")} />;
  else
    content = (
      <>
        <ul className="space-y-3">
          {items.map((agreement) => (
            <li key={agreement.id}>
              <Surface className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{agreement.buyerName}</p>
                  <p className="text-sm text-muted">
                    {agreement.currency} · {agreement.installmentCount}{" "}
                    {t("installments")}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  data-guide="review"
                  onClick={() => setSelected(agreement)}
                >
                  {t("detail")}
                </Button>
              </Surface>
            </li>
          ))}
        </ul>
        {items.length === 0 && <StatePanel title={t("empty")} />}
        <Pagination
          page={page}
          pageSize={20}
          total={total}
          onPageChange={setPage}
        />
      </>
    );
  return (
    <main className="mx-auto min-h-screen max-w-5xl space-y-6 px-4 py-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button variant="secondary" onClick={logout}>
            {t("logout")}
          </Button>
        }
      />
      <FormField id="buyer-sales-search" label={t("search")}>
        {(attributes) => (
          <input
            {...attributes}
            type="search"
            className="ui-field"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        )}
      </FormField>
      {content}
      {selected && (
        <section className="space-y-3" aria-label={t("detail")}>
          <Button variant="secondary" onClick={() => setSelected(undefined)}>
            {t("close")}
          </Button>
          <SaleDetailPanel
            key={selected.id}
            agreement={selected}
            readOnly
            onChanged={() => {}}
          />
        </section>
      )}
    </main>
  );
}

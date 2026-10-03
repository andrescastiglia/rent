"use client";
import { useAssistantRecord } from "@/hooks/useAssistantRecord";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { salesApi } from "@/lib/api/sales";
import { formatMoneyByCode } from "@/lib/format-money";
import {
  Button,
  DataTable,
  Dialog,
  FilterBar,
  FormField,
  PageHeader,
  Pagination,
  StatePanel,
} from "@/components/ui";
import SaleFormDialog from "@/components/sales/SaleFormDialog";
import SaleDetailPanel from "@/components/sales/SaleDetailPanel";
import type { SaleAgreement, SaleFolder } from "@/types/sales";

export default function SalesPage() {
  const { user } = useAuth();
  return <SalesWorkspace key={`${user?.companyId}:${user?.id}`} />;
}
function SalesWorkspace() {
  const { loading: authLoading } = useAuth();
  const locale = useLocale();
  const t = useTranslations("sales");
  const tw = useTranslations("salesWorkspace");
  const tc = useTranslations("common");
  const [folders, setFolders] = useState<SaleFolder[]>([]);
  const [agreements, setAgreements] = useState<SaleAgreement[]>([]);
  const [selected, setSelected] = useState<SaleAgreement>();
  useAssistantRecord(salesApi.getAgreement, setSelected);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [folderId, setFolderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [newSale, setNewSale] = useState(false);
  const [newFolder, setNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderDescription, setFolderDescription] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);
  const [folderError, setFolderError] = useState(false);
  const term = useDebouncedValue(search);
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    Promise.all([
      salesApi.getFolders(),
      salesApi.getAgreementPage({
        page,
        limit: 20,
        search: term,
        folderId: folderId || undefined,
      }),
    ])
      .then(([groups, result]) => {
        if (!cancelled) {
          setFolders(groups);
          setAgreements(result.data);
          setTotal(result.total);
          setSelected((previous) =>
            previous
              ? result.data.find((agreement) => agreement.id === previous.id)
              : undefined,
          );
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
  }, [authLoading, page, term, folderId, revision]);
  const saveFolder = async () => {
    setSavingFolder(true);
    setFolderError(false);
    try {
      const folder = await salesApi.createFolder({
        name: folderName.trim(),
        description: folderDescription.trim() || undefined,
      });
      setFolders((previous) => [folder, ...previous]);
      setNewFolder(false);
      setFolderName("");
      setFolderDescription("");
    } catch {
      setFolderError(true);
    } finally {
      setSavingFolder(false);
    }
  };
  const open = (agreement: SaleAgreement) => (
    <Button
      variant="secondary"
      data-guide="sale-open"
      data-assistant-intent="edit"
      data-assistant-record={agreement.id}
      aria-pressed={selected?.id === agreement.id}
      onClick={() => setSelected(agreement)}
    >
      {tw("detail")}
    </Button>
  );
  let content;
  if (failed)
    content = (
      <StatePanel
        error
        title={tw("error")}
        action={
          <Button
            variant="secondary"
            onClick={() => setRevision((value) => value + 1)}
          >
            {tc("retry")}
          </Button>
        }
      />
    );
  else if (loading) content = <StatePanel busy title={tc("loading")} />;
  else
    content = (
      <>
        <DataTable
          items={agreements}
          rowKey={(agreement) => agreement.id}
          caption={t("title")}
          emptyTitle={tw("empty")}
          columns={[
            {
              key: "buyer",
              title: t("agreements.buyerName"),
              render: (agreement) => (
                <>
                  <p className="font-semibold">{agreement.buyerName}</p>
                  <p className="text-xs text-muted">{agreement.buyerPhone}</p>
                </>
              ),
            },
            {
              key: "total",
              title: t("agreements.totalAmount"),
              align: "right",
              render: (agreement) =>
                formatMoneyByCode(
                  agreement.totalAmount,
                  agreement.currency,
                  locale,
                ),
            },
            {
              key: "balance",
              title: t("agreements.balance"),
              align: "right",
              render: (agreement) =>
                formatMoneyByCode(
                  agreement.totalAmount - agreement.paidAmount,
                  agreement.currency,
                  locale,
                ),
            },
            {
              key: "plan",
              title: t("agreements.installments"),
              render: (agreement) =>
                `${agreement.installmentCount} × ${formatMoneyByCode(agreement.installmentAmount, agreement.currency, locale)}`,
            },
            { key: "detail", title: tw("detail"), render: open },
          ]}
          renderMobileSummary={(agreement) => (
            <div className="space-y-2">
              <p className="font-semibold">{agreement.buyerName}</p>
              <p className="tabular-nums">
                {t("agreements.balance")}:{" "}
                {formatMoneyByCode(
                  agreement.totalAmount - agreement.paidAmount,
                  agreement.currency,
                  locale,
                )}
              </p>
              {open(agreement)}
            </div>
          )}
        />
        <Pagination
          page={page}
          pageSize={20}
          total={total}
          onPageChange={setPage}
        />
      </>
    );
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <>
            <Button
              variant="secondary"
              data-assistant-intent="create"
              data-assistant-open="sale-folder"
              onClick={() => setNewFolder(true)}
            >
              {t("folders.new")}
            </Button>
            <Button
              data-guide="sale-new"
              data-assistant-intent="create"
              onClick={() => setNewSale(true)}
            >
              {t("agreements.new")}
            </Button>
          </>
        }
      />
      <FilterBar>
        <FormField id="sales-search" label={tw("search")}>
          {(attributes) => (
            <input
              {...attributes}
              type="search"
              data-guide="sale-search"
              className="ui-field"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          )}
        </FormField>
        <FormField id="sales-folder" label={t("folders.list")}>
          {(attributes) => (
            <select
              {...attributes}
              className="ui-field"
              value={folderId}
              onChange={(event) => {
                setFolderId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{tw("allFolders")}</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          )}
        </FormField>
      </FilterBar>
      {content}
      {selected && (
        <SaleDetailPanel
          key={selected.id}
          agreement={selected}
          onChanged={() => setRevision((value) => value + 1)}
        />
      )}
      {newSale && (
        <SaleFormDialog
          folders={folders}
          onClose={() => setNewSale(false)}
          onCreated={(agreement) => {
            setNewSale(false);
            setSelected(agreement);
            setRevision((value) => value + 1);
          }}
        />
      )}
      {newFolder && (
        <Dialog
          open
          onClose={() => setNewFolder(false)}
          title={t("folders.new")}
          busy={savingFolder}
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveFolder();
            }}
          >
            <FormField id="folder-name" label={t("folders.name")}>
              {(attributes) => (
                <input
                  {...attributes}
                  className="ui-field"
                  required
                  disabled={savingFolder}
                  value={folderName}
                  onChange={(event) => setFolderName(event.target.value)}
                />
              )}
            </FormField>
            <FormField id="folder-description" label={t("folders.description")}>
              {(attributes) => (
                <textarea
                  {...attributes}
                  className="ui-field"
                  disabled={savingFolder}
                  value={folderDescription}
                  onChange={(event) => setFolderDescription(event.target.value)}
                />
              )}
            </FormField>
            {folderError && <p role="alert">{tc("error")}</p>}
            <Button type="submit" busy={savingFolder}>
              {tc("save")}
            </Button>
          </form>
        </Dialog>
      )}
    </div>
  );
}

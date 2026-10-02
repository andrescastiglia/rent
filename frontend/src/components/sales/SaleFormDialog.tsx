"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { salesApi } from "@/lib/api/sales";
import { propertiesApi } from "@/lib/api/properties";
import { buyersApi } from "@/lib/api/buyers";
import { Button, Dialog, FormField, RemoteSelect } from "@/components/ui";
import { CurrencySelect } from "@/components/common/CurrencySelect";
import type {
  CreateSaleAgreementInput,
  SaleAgreement,
  SaleFolder,
} from "@/types/sales";

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export default function SaleFormDialog({
  folders,
  onClose,
  onCreated,
}: Readonly<{
  folders: SaleFolder[];
  onClose: () => void;
  onCreated: (agreement: SaleAgreement) => void;
}>) {
  const t = useTranslations("sales");
  const tc = useTranslations("common");
  const tw = useTranslations("salesWorkspace");
  const [form, setForm] = useState<CreateSaleAgreementInput>({
    folderId: "",
    propertyId: "",
    buyerId: "",
    totalAmount: 0,
    currency: "ARS",
    installmentAmount: 0,
    installmentCount: 1,
    startDate: today(),
    dueDay: 10,
  });
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const ready = Boolean(
    form.folderId &&
    form.propertyId &&
    form.buyerId &&
    form.startDate &&
    form.totalAmount > 0 &&
    form.installmentAmount > 0 &&
    Number.isInteger(form.installmentCount) &&
    form.installmentCount > 0,
  );
  const update = <K extends keyof CreateSaleAgreementInput>(
    key: K,
    value: CreateSaleAgreementInput[K],
  ) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setReview(false);
  };
  const save = async () => {
    setBusy(true);
    setError(false);
    try {
      onCreated(await salesApi.createAgreement(form));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title={t("agreements.new")} busy={busy}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          if (!review) setReview(true);
          else void save();
        }}
        className="space-y-5"
        aria-busy={busy}
      >
        <fieldset className="space-y-4">
          <legend className="mb-3 text-sm font-semibold">
            {tw("parties")}
          </legend>
          <FormField id="sale-folder" label={t("agreements.selectFolder")}>
            {(attributes) => (
              <select
                {...attributes}
                required
                disabled={busy}
                data-guide="sale-folder"
                value={form.folderId}
                className="ui-field"
                onChange={(event) => update("folderId", event.target.value)}
              >
                <option value="">{t("agreements.selectFolder")}</option>
                {folders.map((folder) => (
                  <option value={folder.id} key={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <RemoteSelect
            id="sale-property"
            label={t("agreements.selectProperty")}
            required
            disabled={busy}
            value={form.propertyId}
            onChange={(value) => update("propertyId", value)}
            load={async (search, page) => {
              const result = await propertiesApi.getPage({
                search,
                page,
                limit: 20,
                operation: "sale",
              });
              return {
                ...result,
                data: result.data.map((property) => ({
                  value: property.id,
                  label: `${property.name} · ${property.address.street} ${property.address.number}`,
                })),
              };
            }}
          />
          <RemoteSelect
            id="sale-buyer"
            label={t("agreements.buyerName")}
            required
            disabled={busy}
            value={form.buyerId}
            onChange={(value) => update("buyerId", value)}
            load={async (name, page) => {
              const result = await buyersApi.getPage({ name, page, limit: 20 });
              return {
                ...result,
                data: result.data.map((buyer) => ({
                  value: buyer.id,
                  label:
                    `${buyer.firstName} ${buyer.lastName}`.trim() ||
                    buyer.email ||
                    buyer.id,
                })),
              };
            }}
          />
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-sm font-semibold">{tw("plan")}</legend>
          <FormField id="sale-total" label={t("agreements.totalAmount")}>
            {(attributes) => (
              <input
                {...attributes}
                className="ui-field"
                type="number"
                min="0.01"
                step="0.01"
                required
                disabled={busy}
                value={form.totalAmount || ""}
                onChange={(event) =>
                  update("totalAmount", Number(event.target.value))
                }
              />
            )}
          </FormField>
          <FormField id="sale-currency" label={tw("currency")}>
            {(attributes) => (
              <CurrencySelect
                {...attributes}
                name="sale-currency"
                value={form.currency ?? "ARS"}
                onChange={(value) => update("currency", value)}
                disabled={busy}
              />
            )}
          </FormField>
          <FormField
            id="sale-installment"
            label={t("agreements.installmentAmount")}
          >
            {(attributes) => (
              <input
                {...attributes}
                className="ui-field"
                type="number"
                min="0.01"
                step="0.01"
                required
                disabled={busy}
                value={form.installmentAmount || ""}
                onChange={(event) =>
                  update("installmentAmount", Number(event.target.value))
                }
              />
            )}
          </FormField>
          <FormField id="sale-count" label={t("agreements.installmentCount")}>
            {(attributes) => (
              <input
                {...attributes}
                className="ui-field"
                type="number"
                min="1"
                step="1"
                required
                disabled={busy}
                value={form.installmentCount}
                onChange={(event) =>
                  update("installmentCount", Number(event.target.value))
                }
              />
            )}
          </FormField>
          <FormField id="sale-start" label={tw("firstDueDate")}>
            {(attributes) => (
              <input
                {...attributes}
                className="ui-field"
                type="date"
                required
                disabled={busy}
                value={form.startDate}
                onChange={(event) => update("startDate", event.target.value)}
              />
            )}
          </FormField>
          <FormField id="sale-due-day" label={tw("dueDay")}>
            {(attributes) => (
              <input
                {...attributes}
                className="ui-field"
                type="number"
                min="1"
                max="28"
                required
                disabled={busy}
                value={form.dueDay}
                onChange={(event) =>
                  update("dueDay", Number(event.target.value))
                }
              />
            )}
          </FormField>
        </fieldset>
        {review && (
          <div className="ui-surface bg-surface-muted p-4">
            <h3 className="font-semibold">{tw("review")}</h3>
            <p className="mt-2 tabular-nums">
              {form.currency} {form.totalAmount} · {form.installmentCount} ×{" "}
              {form.installmentAmount}
            </p>
            <p className="mt-1 text-sm">
              {tw("firstDueDate")}: {form.startDate} · {tw("dueDay")}:{" "}
              {form.dueDay}
            </p>
          </div>
        )}
        {error && <p role="alert">{tc("error")}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button type="submit" busy={busy} disabled={!ready}>
            {review ? tc("confirm") : tw("review")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Info, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { leasesApi } from "@/lib/api/leases";
import { paymentDocumentTemplatesApi } from "@/lib/api/payments";
import { ContractType } from "@/types/lease";
import { PaymentDocumentTemplateType } from "@/types/payment";

type TemplateScope =
  | "contract_rental"
  | "contract_sale"
  | "receipt"
  | "invoice"
  | "credit_note";

type EditableTemplate = {
  id: string;
  name: string;
  templateBody: string;
  isActive: boolean;
};

const emptyForm = {
  name: "",
  templateBody: "",
  isActive: true,
};

const TEMPLATE_VARIABLE_GROUPS: Record<
  TemplateScope,
  Record<string, string[]>
> = {
  contract_rental: {
    global: ["today"],
    lease: [
      "lease.leaseNumber",
      "lease.contractType",
      "lease.startDate",
      "lease.endDate",
      "lease.monthlyRent",
      "lease.currency",
      "lease.paymentFrequency",
      "lease.paymentDueDay",
      "lease.securityDeposit",
      "lease.notes",
    ],
    property: [
      "property.name",
      "property.addressStreet",
      "property.addressNumber",
      "property.addressCity",
      "property.addressState",
    ],
    owner: [
      "owner.firstName",
      "owner.lastName",
      "owner.fullName",
      "owner.email",
    ],
    tenant: [
      "tenant.firstName",
      "tenant.lastName",
      "tenant.fullName",
      "tenant.email",
    ],
  },
  contract_sale: {
    global: ["today"],
    lease: [
      "lease.leaseNumber",
      "lease.contractType",
      "lease.startDate",
      "lease.endDate",
      "lease.fiscalValue",
      "lease.currency",
      "lease.notes",
    ],
    property: [
      "property.name",
      "property.addressStreet",
      "property.addressNumber",
      "property.addressCity",
      "property.addressState",
    ],
    owner: [
      "owner.firstName",
      "owner.lastName",
      "owner.fullName",
      "owner.email",
    ],
    buyer: [
      "buyer.firstName",
      "buyer.lastName",
      "buyer.fullName",
      "buyer.email",
    ],
  },
  receipt: {
    global: ["today"],
    receipt: [
      "receipt.id",
      "receipt.number",
      "receipt.issuedAt",
      "receipt.amount",
      "receipt.currency",
      "receipt.currencySymbol",
    ],
    payment: [
      "payment.id",
      "payment.date",
      "payment.method",
      "payment.reference",
      "payment.notes",
      "payment.itemsSummary",
    ],
    tenant: [
      "tenant.firstName",
      "tenant.lastName",
      "tenant.fullName",
      "tenant.email",
    ],
    property: [
      "property.name",
      "property.addressStreet",
      "property.addressNumber",
      "property.addressCity",
    ],
  },
  invoice: {
    global: ["today"],
    invoice: [
      "invoice.id",
      "invoice.number",
      "invoice.issueDate",
      "invoice.dueDate",
      "invoice.periodStart",
      "invoice.periodEnd",
      "invoice.status",
      "invoice.subtotal",
      "invoice.lateFee",
      "invoice.adjustments",
      "invoice.total",
      "invoice.currency",
      "invoice.currencySymbol",
      "invoice.notes",
    ],
    owner: [
      "owner.firstName",
      "owner.lastName",
      "owner.fullName",
      "owner.email",
    ],
    tenant: [
      "tenant.firstName",
      "tenant.lastName",
      "tenant.fullName",
      "tenant.email",
    ],
    property: [
      "property.name",
      "property.addressStreet",
      "property.addressNumber",
      "property.addressCity",
    ],
  },
  credit_note: {
    global: ["today"],
    creditNote: [
      "creditNote.id",
      "creditNote.number",
      "creditNote.issueDate",
      "creditNote.amount",
      "creditNote.currency",
      "creditNote.reason",
    ],
    invoice: [
      "invoice.id",
      "invoice.number",
      "invoice.dueDate",
      "invoice.total",
      "invoice.currency",
    ],
    tenant: ["tenant.firstName", "tenant.lastName", "tenant.fullName"],
  },
};

const scopeToContractType: Record<
  Extract<TemplateScope, "contract_rental" | "contract_sale">,
  ContractType
> = {
  contract_rental: "rental",
  contract_sale: "sale",
};

const scopeToDocumentType: Record<
  Extract<TemplateScope, "receipt" | "invoice" | "credit_note">,
  PaymentDocumentTemplateType
> = {
  receipt: "receipt",
  invoice: "invoice",
  credit_note: "credit_note",
};

function isContractScope(
  scope: TemplateScope,
): scope is Extract<TemplateScope, "contract_rental" | "contract_sale"> {
  return scope === "contract_rental" || scope === "contract_sale";
}

export default function TemplatesPage() {
  const t = useTranslations("templatesHub");
  const tc = useTranslations("common");
  const locale = useLocale();

  const [scope, setScope] = useState<TemplateScope>("contract_rental");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<EditableTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [form, setForm] = useState(emptyForm);

  const loadTemplates = async (nextScope: TemplateScope) => {
    setLoading(true);
    try {
      const mapped: EditableTemplate[] = isContractScope(nextScope)
        ? (await leasesApi.getTemplates(scopeToContractType[nextScope])).map(
            (item) => ({
              id: item.id,
              name: item.name,
              templateBody: item.templateBody,
              isActive: item.isActive,
            }),
          )
        : (
            await paymentDocumentTemplatesApi.list(
              scopeToDocumentType[nextScope],
            )
          ).map((item) => ({
            id: item.id,
            name: item.name,
            templateBody: item.templateBody,
            isActive: item.isActive,
          }));

      setTemplates(mapped);
      if (mapped.length > 0) {
        const first = mapped[0];
        setSelectedTemplateId(first.id);
        setForm({
          name: first.name,
          templateBody: first.templateBody,
          isActive: first.isActive,
        });
      } else {
        setSelectedTemplateId(null);
        setForm(emptyForm);
      }
    } catch (error) {
      console.error("Failed to load templates", error);
      setTemplates([]);
      setSelectedTemplateId(null);
      setForm(emptyForm);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates(scope);
  }, [scope]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.templateBody.trim()) {
      return;
    }

    setSaving(true);
    try {
      if (isContractScope(scope)) {
        const contractType = scopeToContractType[scope];
        if (selectedTemplateId) {
          const updated = await leasesApi.updateTemplate(selectedTemplateId, {
            contractType,
            name: form.name.trim(),
            templateBody: form.templateBody,
            isActive: form.isActive,
          });
          setTemplates((prev) =>
            prev.map((item) =>
              item.id === updated.id
                ? {
                    id: updated.id,
                    name: updated.name,
                    templateBody: updated.templateBody,
                    isActive: updated.isActive,
                  }
                : item,
            ),
          );
        } else {
          const created = await leasesApi.createTemplate({
            contractType,
            name: form.name.trim(),
            templateBody: form.templateBody,
            isActive: form.isActive,
          });
          setTemplates((prev) => [
            {
              id: created.id,
              name: created.name,
              templateBody: created.templateBody,
              isActive: created.isActive,
            },
            ...prev,
          ]);
          setSelectedTemplateId(created.id);
        }
      } else {
        const type = scopeToDocumentType[scope];
        if (selectedTemplateId) {
          const updated = await paymentDocumentTemplatesApi.update(
            selectedTemplateId,
            {
              type,
              name: form.name.trim(),
              templateBody: form.templateBody,
              isActive: form.isActive,
            },
          );
          setTemplates((prev) =>
            prev.map((item) =>
              item.id === updated.id
                ? {
                    id: updated.id,
                    name: updated.name,
                    templateBody: updated.templateBody,
                    isActive: updated.isActive,
                  }
                : item,
            ),
          );
        } else {
          const created = await paymentDocumentTemplatesApi.create({
            type,
            name: form.name.trim(),
            templateBody: form.templateBody,
            isActive: form.isActive,
          });
          setTemplates((prev) => [
            {
              id: created.id,
              name: created.name,
              templateBody: created.templateBody,
              isActive: created.isActive,
            },
            ...prev,
          ]);
          setSelectedTemplateId(created.id);
        }
      }
    } catch (error) {
      console.error("Failed to save template", error);
      alert(tc("error"));
    } finally {
      setSaving(false);
    }
  };

  const variableGroups = useMemo(
    () => TEMPLATE_VARIABLE_GROUPS[scope],
    [scope],
  );

  const scopeOptions: Array<{ value: TemplateScope; label: string }> = [
    { value: "contract_rental", label: t("scopes.contractRental") },
    { value: "contract_sale", label: t("scopes.contractSale") },
    { value: "receipt", label: t("scopes.receipt") },
    { value: "invoice", label: t("scopes.invoice") },
    { value: "credit_note", label: t("scopes.creditNote") },
  ];

  const handleSelectTemplate = (template: EditableTemplate) => {
    setSelectedTemplateId(template.id);
    setForm({
      name: template.name,
      templateBody: template.templateBody,
      isActive: template.isActive,
    });
  };

  const handleNew = () => {
    setSelectedTemplateId(null);
    setForm(emptyForm);
  };

  const handleInsertVariable = (variableKey: string) => {
    const token = `{{${variableKey}}}`;
    setForm((prev) => ({
      ...prev,
      templateBody: prev.templateBody
        ? `${prev.templateBody}\n${token}`
        : token,
    }));
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/${locale}/dashboard`}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft size={16} className="mr-1" />
          {tc("back")}
        </Link>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t("title")}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as TemplateScope)}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
          >
            {scopeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleNew}
            className="btn btn-secondary"
          >
            {t("newTemplate")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-52">
          <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-4">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {t("listTitle")}
              </h2>
              {templates.length > 0 ? (
                templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleSelectTemplate(template)}
                    className={`w-full text-left rounded-md border p-3 ${
                      selectedTemplateId === template.id
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {template.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {template.isActive ? t("active") : t("inactive")}
                    </p>
                  </button>
                ))
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t("empty")}
                </p>
              )}
            </div>
          </div>

          <div className="xl:col-span-8">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4">
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder={t("namePlaceholder")}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              />
              <textarea
                rows={16}
                value={form.templateBody}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, templateBody: e.target.value }))
                }
                placeholder={t("bodyPlaceholder")}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm font-mono"
              />

              <div className="rounded-md border border-blue-200 bg-blue-50/80 dark:border-blue-900 dark:bg-blue-900/20 p-3">
                <div className="flex items-start gap-2 mb-2">
                  <Info
                    size={16}
                    className="mt-0.5 text-blue-700 dark:text-blue-300"
                  />
                  <div>
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                      {t("variablesTitle")}
                    </p>
                    <p className="text-xs text-blue-800 dark:text-blue-300">
                      {t("variablesDescription")}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {Object.entries(variableGroups).map(([group, variables]) => (
                    <div key={group}>
                      <p className="text-xs font-semibold uppercase text-blue-900 dark:text-blue-200 mb-1">
                        {t(`variableGroups.${group}`)}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {variables.map((variable) => (
                          <button
                            key={variable}
                            type="button"
                            onClick={() => handleInsertVariable(variable)}
                            className="text-xs font-mono px-2 py-1 rounded border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                          >
                            {`{{${variable}}}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <label className="inline-flex items-center text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  className="mr-2"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, isActive: e.target.checked }))
                  }
                />
                {t("activeLabel")}
              </label>

              <div className="flex justify-end">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? tc("saving") : tc("save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

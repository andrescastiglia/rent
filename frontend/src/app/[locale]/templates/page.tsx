"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { leasesApi } from "@/lib/api/leases";
import { paymentDocumentTemplatesApi } from "@/lib/api/payments";
import {
  EditableTemplate,
  isContractScope,
  parseTemplateScope,
  scopeToContractType,
  scopeToDocumentType,
  TemplateScope,
} from "@/components/templates/template-scopes";

export default function TemplatesPage() {
  const t = useTranslations("templatesHub");
  const tc = useTranslations("common");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [scope, setScope] = useState<TemplateScope>(
    parseTemplateScope(searchParams.get("scope")),
  );
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<EditableTemplate[]>([]);

  useEffect(() => {
    setScope(parseTemplateScope(searchParams.get("scope")));
  }, [searchParams]);

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
            isDefault: item.isDefault,
          }));

      setTemplates(mapped);
    } catch (error) {
      console.error("Failed to load templates", error);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates(scope).catch((error) => {
      console.error("Failed to load templates", error);
    });
  }, [scope]);

  const scopeOptions: Array<{ value: TemplateScope; label: string }> = useMemo(
    () => [
      { value: "contract_rental", label: t("scopes.contractRental") },
      { value: "contract_sale", label: t("scopes.contractSale") },
      { value: "receipt", label: t("scopes.receipt") },
      { value: "invoice", label: t("scopes.invoice") },
      { value: "credit_note", label: t("scopes.creditNote") },
    ],
    [t],
  );

  const isPaymentScope = !isContractScope(scope);

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
          <Link
            href={`/${locale}/templates/editor?scope=${scope}`}
            className="btn btn-primary"
          >
            {t("newTemplate")}
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-52">
          <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
        </div>
      ) : templates.length === 0 ? ( // NOSONAR
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {template.name}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className="text-gray-500 dark:text-gray-400">
                      {template.isActive ? t("active") : t("inactive")}
                    </span>
                    {isPaymentScope && template.isDefault ? (
                      <span className="rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-0.5">
                        {t("defaultLabel")}
                      </span>
                    ) : null}
                  </div>
                </div>
                <Link
                  href={`/${locale}/templates/editor?scope=${scope}&templateId=${template.id}`}
                  className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                >
                  <Pencil size={14} />
                  {tc("edit")}
                </Link>
              </div>
              <p className="mt-3 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-line">
                {template.templateBody}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

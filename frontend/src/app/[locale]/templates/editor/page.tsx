"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Info, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { leasesApi } from "@/lib/api/leases";
import { paymentDocumentTemplatesApi } from "@/lib/api/payments";
import {
  emptyTemplateForm,
  isContractScope,
  parseTemplateScope,
  scopeToContractType,
  scopeToDocumentType,
  TEMPLATE_VARIABLE_GROUPS,
  TemplateScope,
} from "@/components/templates/template-scopes";

type TemplateForm = {
  name: string;
  templateBody: string;
  isActive: boolean;
  isDefault: boolean;
};

export default function TemplateEditorPage() {
  const t = useTranslations("templatesHub");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [scope, setScope] = useState<TemplateScope>(
    parseTemplateScope(searchParams.get("scope")),
  );
  const [templateId, setTemplateId] = useState<string | null>(
    searchParams.get("templateId"),
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState<TemplateForm>(emptyTemplateForm);

  useEffect(() => {
    setScope(parseTemplateScope(searchParams.get("scope")));
    setTemplateId(searchParams.get("templateId"));
  }, [searchParams]);

  useEffect(() => {
    const loadTemplate = async () => {
      if (!templateId) {
        setNotFound(false);
        setForm({ ...emptyTemplateForm });
        return;
      }

      setLoading(true);
      setNotFound(false);
      try {
        if (isContractScope(scope)) {
          const templates = await leasesApi.getTemplates(
            scopeToContractType[scope],
          );
          const target = templates.find((item) => item.id === templateId);
          if (!target) {
            setNotFound(true);
            return;
          }
          setForm({
            name: target.name,
            templateBody: target.templateBody,
            isActive: target.isActive,
            isDefault: false,
          });
          return;
        }

        const templates = await paymentDocumentTemplatesApi.list(
          scopeToDocumentType[scope],
        );
        const target = templates.find((item) => item.id === templateId);
        if (!target) {
          setNotFound(true);
          return;
        }
        setForm({
          name: target.name,
          templateBody: target.templateBody,
          isActive: target.isActive,
          isDefault: target.isDefault,
        });
      } catch (error) {
        console.error("Failed to load template", error);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    loadTemplate().catch((error) => {
      console.error("Failed to load template", error);
    });
  }, [scope, templateId]);

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

  const isEditing = !!templateId;

  const handleInsertVariable = (variableKey: string) => {
    const token = `{{${variableKey}}}`;
    setForm((prev) => ({
      ...prev,
      templateBody: prev.templateBody
        ? `${prev.templateBody}\n${token}`
        : token,
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.templateBody.trim()) {
      return;
    }

    setSaving(true);
    try {
      if (isContractScope(scope)) {
        const contractType = scopeToContractType[scope];
        if (templateId) {
          await leasesApi.updateTemplate(templateId, {
            contractType,
            name: form.name.trim(),
            templateBody: form.templateBody,
            isActive: form.isActive,
          });
        } else {
          await leasesApi.createTemplate({
            contractType,
            name: form.name.trim(),
            templateBody: form.templateBody,
            isActive: form.isActive,
          });
        }
      } else {
        const type = scopeToDocumentType[scope];
        if (templateId) {
          await paymentDocumentTemplatesApi.update(templateId, {
            type,
            name: form.name.trim(),
            templateBody: form.templateBody,
            isActive: form.isActive,
            isDefault: form.isDefault,
          });
        } else {
          await paymentDocumentTemplatesApi.create({
            type,
            name: form.name.trim(),
            templateBody: form.templateBody,
            isActive: form.isActive,
            isDefault: form.isDefault,
          });
        }
      }

      router.push(`/${locale}/templates?scope=${scope}`);
    } catch (error) {
      console.error("Failed to save template", error);
      alert(tc("error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/${locale}/templates?scope=${scope}`}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft size={16} className="mr-1" />
          {t("backToList")}
        </Link>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {isEditing ? t("editTemplate") : t("createTemplate")}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t("editorSubtitle")}
          </p>
        </div>
        <div>
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
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-52">
          <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
        </div>
      ) : notFound ? ( // NOSONAR
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t("templateNotFound")}
          </p>
        </div>
      ) : (
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

          {!isContractScope(scope) ? ( // NOSONAR
            <label className="inline-flex items-center text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                className="mr-2"
                checked={form.isDefault}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    isDefault: e.target.checked,
                    isActive: e.target.checked ? true : prev.isActive,
                  }))
                }
              />
              {t("defaultLabel")}
            </label>
          ) : null}

          <label className="inline-flex items-center text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              className="mr-2"
              checked={form.isActive}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  isActive: e.target.checked,
                  isDefault:
                    !isContractScope(scope) && !e.target.checked
                      ? false
                      : prev.isDefault,
                }))
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
      )}
    </div>
  );
}

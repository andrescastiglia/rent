"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { interestedApi } from "@/lib/api/interested";
import {
  CreateInterestedProfileInput,
  InterestedOperation,
  InterestedPropertyType,
} from "@/types/interested";

const emptyForm: CreateInterestedProfileInput = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  peopleCount: undefined,
  minAmount: undefined,
  maxAmount: undefined,
  hasPets: false,
  preferredCity: "",
  desiredFeatures: [],
  propertyTypePreference: "apartment",
  operation: "rent",
  operations: ["rent"],
  notes: "",
};

export default function NewInterestedPage() {
  const t = useTranslations("interested");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useLocalizedRouter();

  const [form, setForm] = useState<CreateInterestedProfileInput>(emptyForm);
  const [saving, setSaving] = useState(false);

  const operations = useMemo(
    () => form.operations ?? (form.operation ? [form.operation] : []),
    [form.operation, form.operations],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.phone?.trim()) {
      alert(t("errors.phoneRequired"));
      return;
    }

    setSaving(true);
    try {
      const normalizedOperations: InterestedOperation[] = Array.from(
        new Set(
          form.operations && form.operations.length > 0
            ? form.operations
            : form.operation
              ? [form.operation]
              : ["rent"],
        ),
      );

      const payload: CreateInterestedProfileInput = {
        ...form,
        operation: normalizedOperations[0],
        operations: normalizedOperations,
        firstName: form.firstName?.trim() || undefined,
        lastName: form.lastName?.trim() || undefined,
        phone: form.phone.trim(),
        email: form.email?.trim() || undefined,
        preferredCity: form.preferredCity?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
        desiredFeatures: form.desiredFeatures?.filter(
          (item) => item.trim().length > 0,
        ),
      };

      await interestedApi.create(payload);
      router.push("/interested");
      router.refresh();
    } catch (error) {
      console.error("Failed to create interested profile", error);
      alert(tc("error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/${locale}/interested`}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft size={16} className="mr-1" />
          {tc("back")}
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
      >
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          {t("newTitle")}
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder={t("fields.firstName")}
            value={form.firstName ?? ""}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, firstName: e.target.value }))
            }
            className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
          />
          <input
            type="text"
            placeholder={t("fields.lastName")}
            value={form.lastName ?? ""}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, lastName: e.target.value }))
            }
            className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
          />
          <input
            type="text"
            placeholder={t("fields.phone")}
            value={form.phone ?? ""}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, phone: e.target.value }))
            }
            className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
          />
          <input
            type="email"
            placeholder={t("fields.email")}
            value={form.email ?? ""}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, email: e.target.value }))
            }
            className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
          />

          <div className="space-y-2 md:col-span-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t("fields.operations")}
            </p>
            <div className="flex flex-wrap gap-3">
              {(["rent", "sale"] as const).map((operation) => (
                <label
                  key={operation}
                  className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <input
                    type="checkbox"
                    checked={operations.includes(operation)}
                    onChange={(e) =>
                      setForm((prev) => {
                        const current = prev.operations ?? [];
                        const next = e.target.checked
                          ? [...new Set([...current, operation])]
                          : current.filter((item) => item !== operation);
                        return {
                          ...prev,
                          operations: next,
                          operation: next[0] ?? "rent",
                        };
                      })
                    }
                    className="rounded-sm border-gray-300 dark:border-gray-600"
                  />
                  {t(`operations.${operation}`)}
                </label>
              ))}
            </div>
          </div>

          <select
            value={form.propertyTypePreference}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                propertyTypePreference: e.target
                  .value as InterestedPropertyType,
              }))
            }
            className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
          >
            <option value="apartment">{t("propertyTypes.apartment")}</option>
            <option value="house">{t("propertyTypes.house")}</option>
            <option value="commercial">{t("propertyTypes.commercial")}</option>
            <option value="office">{t("propertyTypes.office")}</option>
            <option value="warehouse">{t("propertyTypes.warehouse")}</option>
            <option value="land">{t("propertyTypes.land")}</option>
            <option value="parking">{t("propertyTypes.parking")}</option>
            <option value="other">{t("propertyTypes.other")}</option>
          </select>

          <input
            type="number"
            min={1}
            placeholder={t("fields.peopleCount")}
            value={form.peopleCount ?? ""}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                peopleCount: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              }))
            }
            className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
          />
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder={t("fields.minAmount")}
            value={form.minAmount ?? ""}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                minAmount: e.target.value ? Number(e.target.value) : undefined,
              }))
            }
            className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
          />
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder={t("fields.maxAmount")}
            value={form.maxAmount ?? ""}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                maxAmount: e.target.value ? Number(e.target.value) : undefined,
              }))
            }
            className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
          />
          <input
            type="text"
            placeholder={t("fields.preferredCity")}
            value={form.preferredCity ?? ""}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, preferredCity: e.target.value }))
            }
            className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
          />
          <input
            type="text"
            placeholder={t("fields.desiredFeatures")}
            value={(form.desiredFeatures ?? []).join(", ")}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                desiredFeatures: e.target.value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
              }))
            }
            className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
          />

          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.hasPets ?? false}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, hasPets: e.target.checked }))
              }
              className="rounded-sm border-gray-300 dark:border-gray-600"
            />
            {t("fields.hasPets")}
          </label>

          <textarea
            placeholder={t("fields.notes")}
            value={form.notes ?? ""}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, notes: e.target.value }))
            }
            rows={3}
            className="md:col-span-2 w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? t("actions.saving") : t("actions.save")}
        </button>
      </form>
    </div>
  );
}

"use client";

import React, { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { ownersApi } from "@/lib/api/owners";
import { CreateOwnerInput, Owner } from "@/types/owner";

interface OwnerFormProps {
  readonly initialData?: Owner;
  readonly isEditing?: boolean;
}

const emptyOwnerForm: CreateOwnerInput = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  taxId: "",
  notes: "",
};

export function OwnerForm({ initialData, isEditing = false }: OwnerFormProps) {
  const t = useTranslations("properties");
  const tc = useTranslations("common");
  const router = useLocalizedRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<CreateOwnerInput>(
    initialData
      ? {
          firstName: initialData.firstName,
          lastName: initialData.lastName,
          email: initialData.email,
          phone: initialData.phone ?? "",
          taxId: initialData.taxId ?? "",
          notes: initialData.notes ?? "",
        }
      : emptyOwnerForm,
  );

  const canSubmit = useMemo(
    () =>
      Boolean(
        form.firstName?.trim() && form.lastName?.trim() && form.email?.trim(),
      ),
    [form.email, form.firstName, form.lastName],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const payload: CreateOwnerInput = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone?.trim() || undefined,
        taxId: form.taxId?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
      };

      if (isEditing && initialData) {
        await ownersApi.update(initialData.id, payload);
      } else {
        await ownersApi.create(payload);
      }

      router.push("/properties");
      router.refresh();
    } catch (error) {
      console.error("Failed to save owner", error);
      alert(tc("error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xs border border-gray-100 dark:border-gray-700"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="firstName"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t("ownerFields.firstName")}
          </label>
          <input
            id="firstName"
            type="text"
            value={form.firstName ?? ""}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, firstName: e.target.value }))
            }
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
          />
        </div>
        <div>
          <label
            htmlFor="lastName"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t("ownerFields.lastName")}
          </label>
          <input
            id="lastName"
            type="text"
            value={form.lastName ?? ""}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, lastName: e.target.value }))
            }
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
          />
        </div>
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t("ownerFields.email")}
          </label>
          <input
            id="email"
            type="email"
            value={form.email ?? ""}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, email: e.target.value }))
            }
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
          />
        </div>
        <div>
          <label
            htmlFor="phone"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t("ownerFields.phone")}
          </label>
          <input
            id="phone"
            type="text"
            value={form.phone ?? ""}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, phone: e.target.value }))
            }
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
          />
        </div>
        <div className="md:col-span-2">
          <label
            htmlFor="taxId"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t("ownerFields.taxId")}
          </label>
          <input
            id="taxId"
            type="text"
            value={form.taxId ?? ""}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, taxId: e.target.value }))
            }
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700"
        >
          {tc("cancel")}
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !canSubmit}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin mr-2 h-4 w-4" />
              {tc("saving")}
            </>
          ) : (
            tc("save")
          )}
        </button>
      </div>
    </form>
  );
}

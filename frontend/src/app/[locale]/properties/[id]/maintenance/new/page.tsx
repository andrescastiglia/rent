"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { propertiesApi } from "@/lib/api/properties";
import { Property, CreatePropertyMaintenanceTaskInput } from "@/types/property";

export default function CreatePropertyMaintenanceTaskPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations("properties");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useLocalizedRouter();
  const params = useParams();
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defaultTaskDate = useMemo(() => {
    const now = new Date();
    const offsetMinutes = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offsetMinutes * 60000);
    return local.toISOString().slice(0, 16);
  }, []);
  const [form, setForm] = useState({
    scheduledAt: defaultTaskDate,
    title: "",
    notes: "",
  });

  useEffect(() => {
    if (authLoading || !propertyId) return;

    const loadProperty = async () => {
      try {
        const data = await propertiesApi.getById(propertyId);
        setProperty(data);
      } catch (loadError) {
        console.error(
          "Failed to load property for maintenance task creation",
          loadError,
        );
      } finally {
        setLoading(false);
      }
    };

    loadProperty().catch((error) => {
      console.error(
        "Failed to load property for maintenance task creation",
        error,
      );
    });
  }, [authLoading, propertyId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!propertyId) return;

    setError(null);
    if (!form.title.trim()) {
      setError(t("maintenanceErrors.titleRequired"));
      return;
    }

    const parsedScheduledAt = new Date(form.scheduledAt);
    if (Number.isNaN(parsedScheduledAt.getTime())) {
      setError(t("maintenanceErrors.invalidDate"));
      return;
    }

    const payload: CreatePropertyMaintenanceTaskInput = {
      scheduledAt: parsedScheduledAt.toISOString(),
      title: form.title.trim(),
      notes: form.notes.trim() || undefined,
    };

    setIsSubmitting(true);
    try {
      await propertiesApi.createMaintenanceTask(propertyId, payload);
      router.push(`/properties/${propertyId}`);
      router.refresh();
    } catch (submitError) {
      console.error("Failed to save maintenance task", submitError);
      setError(tc("error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (!property || !propertyId) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("notFound")}
        </h1>
        <Link
          href={`/${locale}/properties`}
          className="text-blue-600 hover:underline mt-4 inline-block"
        >
          {t("backToList")}
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/${locale}/properties/${propertyId}`}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft size={16} className="mr-1" />
          {t("backToDetails")}
        </Link>
      </div>

      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {t("saveMaintenanceTask")}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
          {property.name}
        </p>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xs border border-gray-100 dark:border-gray-700"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="maintenanceDate"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {t("fields.scheduledAt")}
              </label>
              <input
                id="maintenanceDate"
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    scheduledAt: event.target.value,
                  }))
                }
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label
                htmlFor="maintenanceTitle"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {t("fields.taskTitle")}
              </label>
              <input
                id="maintenanceTitle"
                value={form.title}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, title: event.target.value }))
                }
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
                placeholder={t("placeholders.taskTitle")}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="maintenanceNotes"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("fields.taskNotes")}
            </label>
            <textarea
              id="maintenanceNotes"
              value={form.notes}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, notes: event.target.value }))
              }
              rows={3}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
              placeholder={t("placeholders.taskNotes")}
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

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
              disabled={isSubmitting}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                  {tc("saving")}
                </>
              ) : (
                t("saveMaintenanceTask")
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

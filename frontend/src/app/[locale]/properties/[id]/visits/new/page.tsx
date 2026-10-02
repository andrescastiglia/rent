"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { propertiesApi } from "@/lib/api/properties";
import { CreatePropertyVisitInput, Property } from "@/types/property";
import { interestedApi } from "@/lib/api/interested";
import { InterestedProfile } from "@/types/interested";
import { canUserAccessModule } from "@/lib/permissions";
import { collectPages } from "@/lib/pagination";
import { Button, StatePanel } from "@/components/ui";

export default function CreatePropertyVisitPage() {
  const { loading: authLoading, user } = useAuth();
  const canManage = Boolean(
    user && canUserAccessModule(user, ["admin", "staff"], "properties"),
  );
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
  const [readFailed, setReadFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [interestedProfiles, setInterestedProfiles] = useState<
    InterestedProfile[]
  >([]);

  const defaultVisitDate = useMemo(() => {
    const now = new Date();
    const offsetMinutes = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offsetMinutes * 60000);
    return local.toISOString().slice(0, 10);
  }, []);

  const [form, setForm] = useState({
    visitedAt: defaultVisitDate,
    interestedName: "",
    interestedProfileId: "",
    comments: "",
    hasOffer: false,
    offerAmount: "",
    offerCurrency: "ARS",
  });

  useEffect(() => {
    if (authLoading || !propertyId) return;
    if (!canManage) {
      setLoading(false);
      return;
    }

    const loadProperty = async () => {
      setLoading(true);
      setReadFailed(false);
      try {
        const data = await propertiesApi.getById(propertyId);
        setProperty(data);
        if (data) {
          const profiles = await collectPages((page) =>
            interestedApi.getAll({
              operation:
                data.operations?.length === 1 ? data.operations[0] : undefined,
              page,
              limit: 100,
            }),
          );
          setInterestedProfiles(profiles);
        }
      } catch (loadError) {
        console.error("Failed to load property for visit creation", loadError);
        setReadFailed(true);
      } finally {
        setLoading(false);
      }
    };

    loadProperty().catch((loadError) => {
      console.error("Failed to load property for visit creation", loadError);
    });
  }, [authLoading, propertyId, canManage, revision]);

  const handleSubmit = async (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (!propertyId || !canManage || readFailed) return;

    setError(null);
    if (!form.interestedName.trim()) {
      setError(t("visitForm.nameRequired"));
      return;
    }

    const parsedVisitedAt = new Date(form.visitedAt);
    if (Number.isNaN(parsedVisitedAt.getTime())) {
      setError(t("visitForm.invalidDate"));
      return;
    }

    const payload: CreatePropertyVisitInput = {
      visitedAt: form.visitedAt,
      interestedName: form.interestedName.trim(),
      interestedProfileId: form.interestedProfileId || undefined,
      comments: form.comments.trim() || undefined,
      hasOffer: form.hasOffer,
      offerAmount: form.hasOffer ? Number(form.offerAmount || 0) : undefined,
      offerCurrency: form.hasOffer ? form.offerCurrency : undefined,
    };

    if (
      form.hasOffer &&
      (!payload.offerAmount ||
        !Number.isFinite(payload.offerAmount) ||
        payload.offerAmount <= 0)
    ) {
      setError(t("visitForm.invalidOffer"));
      return;
    }

    setIsSubmitting(true);
    try {
      await propertiesApi.createVisit(propertyId, payload);
      router.push(`/properties/${propertyId}`);
      router.refresh();
    } catch (submitError) {
      console.error("Failed to save property visit", submitError);
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

  if (!canManage) return <StatePanel error title={tc("accessDeniedMessage")} />;
  if (readFailed)
    return (
      <StatePanel
        error
        title={tc("error")}
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
          {t("visitForm.title")}
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
                htmlFor="interestedProfileId"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {t("visitForm.registeredPerson")}
              </label>
              <select
                id="interestedProfileId"
                value={form.interestedProfileId}
                onChange={(event) => {
                  const profile = interestedProfiles.find(
                    (item) => item.id === event.target.value,
                  );
                  setForm((prev) => ({
                    ...prev,
                    interestedProfileId: event.target.value,
                    interestedName: profile
                      ? [profile.firstName, profile.lastName]
                          .filter(Boolean)
                          .join(" ")
                      : prev.interestedName,
                  }));
                }}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
              >
                <option value="">{t("visitForm.manual")}</option>
                {interestedProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {[profile.firstName, profile.lastName]
                      .filter(Boolean)
                      .join(" ") || profile.phone}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="visitDate"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {t("visitForm.date")}
              </label>
              <input
                id="visitDate"
                type="date"
                required
                value={form.visitedAt}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    visitedAt: event.target.value,
                  }))
                }
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label
                htmlFor="interestedName"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {t("visitForm.person")}
              </label>
              <input
                id="interestedName"
                required
                value={form.interestedName}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    interestedName: event.target.value,
                  }))
                }
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
                placeholder={t("visitForm.namePlaceholder")}
                disabled={Boolean(form.interestedProfileId)}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="visitComments"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("visitForm.comments")}
            </label>
            <textarea
              id="visitComments"
              value={form.comments}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, comments: event.target.value }))
              }
              rows={4}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
              placeholder={t("visitForm.commentsPlaceholder")}
            />
          </div>

          <label
            htmlFor="visitHasOffer"
            className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
          >
            <input
              id="visitHasOffer"
              type="checkbox"
              checked={form.hasOffer}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, hasOffer: event.target.checked }))
              }
            />
            {t("visitForm.hasOffer")}
          </label>

          {form.hasOffer ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="offerAmount"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {t("visitForm.offerAmount")}
                </label>
                <input
                  id="offerAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.offerAmount}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      offerAmount: event.target.value,
                    }))
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="offerCurrency"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {t("visitForm.currency")}
                </label>
                <select
                  id="offerCurrency"
                  value={form.offerCurrency}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      offerCurrency: event.target.value,
                    }))
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
                >
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}

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
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                  {tc("saving")}
                </>
              ) : (
                t("visitForm.title")
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

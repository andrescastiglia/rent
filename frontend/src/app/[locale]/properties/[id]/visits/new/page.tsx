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

export default function CreatePropertyVisitPage() {
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

  const defaultVisitDate = useMemo(() => {
    const now = new Date();
    const offsetMinutes = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offsetMinutes * 60000);
    return local.toISOString().slice(0, 10);
  }, []);

  const [form, setForm] = useState({
    visitedAt: defaultVisitDate,
    interestedName: "",
    comments: "",
    hasOffer: false,
    offerAmount: "",
    offerCurrency: "ARS",
  });

  useEffect(() => {
    if (authLoading || !propertyId) return;

    const loadProperty = async () => {
      try {
        const data = await propertiesApi.getById(propertyId);
        setProperty(data);
      } catch (loadError) {
        console.error("Failed to load property for visit creation", loadError);
      } finally {
        setLoading(false);
      }
    };

    loadProperty().catch((loadError) => {
      console.error("Failed to load property for visit creation", loadError);
    });
  }, [authLoading, propertyId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!propertyId) return;

    setError(null);
    if (!form.interestedName.trim()) {
      setError("El nombre del interesado es obligatorio.");
      return;
    }

    const parsedVisitedAt = new Date(form.visitedAt);
    if (Number.isNaN(parsedVisitedAt.getTime())) {
      setError("La fecha de visita no es válida.");
      return;
    }

    const payload: CreatePropertyVisitInput = {
      visitedAt: form.visitedAt,
      interestedName: form.interestedName.trim(),
      comments: form.comments.trim() || undefined,
      hasOffer: form.hasOffer,
      offerAmount: form.hasOffer ? Number(form.offerAmount || 0) : undefined,
      offerCurrency: form.hasOffer ? form.offerCurrency : undefined,
    };

    if (form.hasOffer && (!payload.offerAmount || payload.offerAmount <= 0)) {
      setError("Si la visita tiene oferta, el monto debe ser mayor a cero.");
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
          Registrar visita
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
                htmlFor="visitDate"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Fecha de visita
              </label>
              <input
                id="visitDate"
                type="date"
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
                Interesado
              </label>
              <input
                id="interestedName"
                value={form.interestedName}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    interestedName: event.target.value,
                  }))
                }
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
                placeholder="Nombre y apellido"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="visitComments"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Comentarios
            </label>
            <textarea
              id="visitComments"
              value={form.comments}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, comments: event.target.value }))
              }
              rows={4}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
              placeholder="Interés, condiciones, observaciones de la visita"
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
            {"La visita incluyó una oferta"}
          </label>

          {form.hasOffer ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="offerAmount"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Monto de oferta
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
                  Moneda
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
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                  {tc("saving")}
                </>
              ) : (
                "Registrar visita"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

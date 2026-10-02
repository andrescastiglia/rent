"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { propertiesApi } from "@/lib/api/properties";
import {
  Property,
  PropertyVisit,
  UpdatePropertyVisitResultInput,
} from "@/types/property";
import { canUserAccessModule } from "@/lib/permissions";
import { Button, StatePanel } from "@/components/ui";

export default function PropertyVisitResultPage() {
  const { loading: authLoading, user } = useAuth();
  const canManage = Boolean(
    user && canUserAccessModule(user, ["admin", "staff"], "properties"),
  );
  const tc = useTranslations("common");
  const t = useTranslations("properties.visitResult");
  const locale = useLocale();
  const router = useLocalizedRouter();
  const params = useParams();
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;
  const visitId = Array.isArray(params.visitId)
    ? params.visitId[0]
    : params.visitId;
  const [property, setProperty] = useState<Property | null>(null);
  const [visit, setVisit] = useState<PropertyVisit | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [form, setForm] = useState({
    result: "interested" as UpdatePropertyVisitResultInput["result"],
    reason: "",
    offerAmount: "",
    offerCurrency: "ARS",
  });

  useEffect(() => {
    if (authLoading || !propertyId || !visitId) return;
    if (!canManage) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setReadFailed(false);
    Promise.all([
      propertiesApi.getById(propertyId),
      propertiesApi.getVisits(propertyId),
    ])
      .then(([propertyData, visits]) => {
        if (cancelled) return;
        setProperty(propertyData);
        const selectedVisit =
          visits.find((item) => item.id === visitId) ?? null;
        setVisit(selectedVisit);
        setForm({
          result:
            selectedVisit?.result && selectedVisit.result !== "pending"
              ? selectedVisit.result
              : "interested",
          reason: selectedVisit?.resultReason ?? "",
          offerAmount:
            selectedVisit?.offerAmount == null
              ? ""
              : String(selectedVisit.offerAmount),
          offerCurrency: selectedVisit?.offerCurrency ?? "ARS",
        });
      })
      .catch((loadError) => {
        if (cancelled) return;
        console.error("Failed to load property visit", loadError);
        setReadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, propertyId, canManage, revision, visitId]);

  const submit = async (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (!propertyId || !visitId || !canManage || readFailed || saving) return;
    if (form.result === "not_interested" && !form.reason.trim()) {
      setError(t("reasonRequired"));
      return;
    }
    const offerAmount = Number(form.offerAmount);
    if (
      form.result === "offer" &&
      (!Number.isFinite(offerAmount) || offerAmount <= 0)
    ) {
      setError(t("invalidOffer"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await propertiesApi.updateVisitResult(propertyId, visitId, {
        result: form.result,
        reason: form.reason.trim() || undefined,
        offerAmount: form.result === "offer" ? offerAmount : undefined,
        offerCurrency: form.result === "offer" ? form.offerCurrency : undefined,
      });
      router.push(`/properties/${propertyId}`);
      router.refresh();
    } catch (submitError) {
      console.error("Failed to update property visit result", submitError);
      setError(tc("error"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
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
  if (!property || !visit || !propertyId)
    return <StatePanel title={t("notFound")} />;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Link
        href={`/${locale}/properties/${propertyId}`}
        className="mb-6 inline-flex items-center text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} className="mr-1" /> {t("back")}
      </Link>
      <h1 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
        {t("title")}
      </h1>
      <p className="mb-8 text-sm text-gray-500">
        {property.name} · {visit.interestedName ?? t("prospect")}
      </p>
      <form
        onSubmit={submit}
        className="space-y-5 rounded-lg border border-gray-100 bg-white p-6 shadow-xs dark:border-gray-700 dark:bg-gray-800"
      >
        <div>
          <label htmlFor="visitResult" className="block text-sm font-medium">
            {t("result")}
          </label>
          <select
            id="visitResult"
            value={form.result}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                result: event.target
                  .value as UpdatePropertyVisitResultInput["result"],
              }))
            }
            className="mt-1 w-full rounded-md border p-2 dark:bg-gray-700"
          >
            <option value="interested">{t("interested")}</option>
            <option value="not_interested">{t("notInterested")}</option>
            <option value="offer">{t("offer")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="resultReason" className="block text-sm font-medium">
            {t("reason")}
          </label>
          <textarea
            id="resultReason"
            rows={4}
            required={form.result === "not_interested"}
            value={form.reason}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                reason: event.target.value,
              }))
            }
            className="mt-1 w-full rounded-md border p-2 dark:bg-gray-700"
          />
        </div>
        {form.result === "offer" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <input
              aria-label={t("offerAmount")}
              type="number"
              min="0.01"
              step="0.01"
              value={form.offerAmount}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  offerAmount: event.target.value,
                }))
              }
              className="rounded-md border p-2 dark:bg-gray-700"
              placeholder={t("amount")}
            />
            <select
              aria-label={t("offerCurrency")}
              value={form.offerCurrency}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  offerCurrency: event.target.value,
                }))
              }
              className="rounded-md border p-2 dark:bg-gray-700"
            >
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.back()}>
            {tc("cancel")}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {saving ? tc("saving") : t("submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { interestedApi } from "@/lib/api/interested";
import { whatsappApi } from "@/lib/api/whatsapp";
import {
  InterestedActivity,
  InterestedProfile,
  InterestedSummary,
} from "@/types/interested";

const ACTIVITY_TYPES: InterestedActivity["type"][] = [
  "task",
  "call",
  "note",
  "whatsapp",
  "visit",
];

export default function InterestedActivityCreatePage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations("interested");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useLocalizedRouter();
  const params = useParams();
  const interestedId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [profile, setProfile] = useState<InterestedProfile | null>(null);
  const [summary, setSummary] = useState<InterestedSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    type: "task" as InterestedActivity["type"],
    subject: "",
    body: "",
    dueAt: "",
    propertyId: "",
    markReserved: false,
  });

  const profileName =
    `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() ||
    profile?.phone ||
    "-";

  const suggestedProperties = useMemo(() => {
    if (!summary) return [];

    const propertyMap = new Map<string, string>();
    for (const match of summary.matches ?? []) {
      if (!match.propertyId) continue;
      propertyMap.set(
        match.propertyId,
        match.property?.name ?? match.propertyId,
      );
    }

    return Array.from(propertyMap.entries()).map(([id, name]) => ({
      id,
      name,
    }));
  }, [summary]);

  const loadData = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const result = await interestedApi.getSummary(id);
      setSummary(result);
      setProfile(result.profile);
    } catch (error) {
      console.error("Failed to load interested activity creation data", error);
      setSummary(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!interestedId) return;
    void loadData(interestedId);
  }, [authLoading, interestedId, loadData]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile) return;

    if (!form.subject.trim()) {
      alert(t("errors.activitySubjectRequired"));
      return;
    }
    if (form.type === "whatsapp" && !profile.phone?.trim()) {
      alert(t("errors.phoneRequired"));
      return;
    }

    if (form.markReserved && !form.propertyId) {
      alert(t("errors.propertyRequiredForReservation"));
      return;
    }

    try {
      setSaving(true);
      await interestedApi.addActivity(profile.id, {
        type: form.type,
        subject: form.subject.trim(),
        body: form.body.trim() || undefined,
        dueAt: form.dueAt || undefined,
        propertyId: form.propertyId || undefined,
        markReserved: form.markReserved,
      });

      if (form.type === "whatsapp" && profile.phone?.trim()) {
        const text = [form.subject.trim(), form.body.trim()]
          .filter(Boolean)
          .join("\n\n");
        await whatsappApi.sendMessage({
          to: profile.phone.trim(),
          text,
        });
      }

      router.push("/interested");
      router.refresh();
    } catch (error) {
      console.error("Failed to create interested activity", error);
      alert(tCommon("error"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("noResults")}
        </h1>
        <Link
          href={`/${locale}/interested`}
          className="text-blue-600 hover:underline mt-4 inline-block"
        >
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/${locale}/interested`}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft size={16} className="mr-1" />
          {tCommon("back")}
        </Link>
      </div>

      <div className="mb-6 space-y-1">
        <p className="text-2xl font-bold text-gray-900 dark:text-white">
          {profileName}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {profile.email ?? profile.phone}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-3 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            value={form.type}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                type: e.target.value as InterestedActivity["type"],
              }))
            }
            className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
          >
            {ACTIVITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`activityTypes.${type}`)}
              </option>
            ))}
          </select>

          <input
            type="datetime-local"
            value={form.dueAt}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                dueAt: e.target.value,
              }))
            }
            className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
          />
        </div>

        <input
          type="text"
          value={form.subject}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              subject: e.target.value,
            }))
          }
          placeholder={t("activities.subject")}
          className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
        />

        <textarea
          rows={3}
          value={form.body}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              body: e.target.value,
            }))
          }
          placeholder={t("activities.body")}
          className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
        />

        <select
          value={form.propertyId}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              propertyId: e.target.value,
            }))
          }
          className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
        >
          <option value="">{t("activities.noProperty")}</option>
          {suggestedProperties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </select>

        <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={form.markReserved}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                markReserved: e.target.checked,
              }))
            }
            className="rounded-sm border-gray-300 dark:border-gray-600"
          />
          {t("activities.markReserved")}
        </label>

        <button
          type="submit"
          disabled={saving}
          className="btn btn-primary w-full"
        >
          <Plus size={16} className="mr-2" />
          {saving ? tCommon("saving") : t("activities.add")}
        </button>
      </form>
    </div>
  );
}

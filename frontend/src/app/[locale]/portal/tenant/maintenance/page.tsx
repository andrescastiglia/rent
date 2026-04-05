"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { leasesApi } from "@/lib/api/leases";
import { propertiesApi } from "@/lib/api/properties";
import { Lease } from "@/types/lease";
import { PropertyMaintenanceTask } from "@/types/property";
import { Loader2, CheckCircle2 } from "lucide-react";

function getLocaleCode(loc: string): string {
  if (loc === "en") return "en-US";
  if (loc === "pt") return "pt-BR";
  return "es-AR";
}

type MaintenanceArea =
  | "kitchen"
  | "bathroom"
  | "electrical"
  | "plumbing"
  | "other";
type UrgencyLevel = "low" | "medium" | "high";

const AREAS: MaintenanceArea[] = [
  "kitchen",
  "bathroom",
  "electrical",
  "plumbing",
  "other",
];
const URGENCIES: UrgencyLevel[] = ["low", "medium", "high"];

export default function TenantMaintenancePage() {
  const t = useTranslations("tenantPortal");
  const locale = useLocale();
  const [activeLease, setActiveLease] = useState<Lease | null>(null);
  const [tasks, setTasks] = useState<PropertyMaintenanceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    area: "other" as MaintenanceArea,
    urgency: "medium" as UrgencyLevel,
  });

  const defaultTaskDate = useMemo(() => new Date().toISOString(), []);

  useEffect(() => {
    const load = async () => {
      try {
        const leases = await leasesApi.getAll({ status: "ACTIVE" });
        const active =
          leases.find((l) => l.status === "ACTIVE") ?? leases[0] ?? null;
        setActiveLease(active);
        setTasks([]);
      } catch {
        // fail silently
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLease?.propertyId) return;
    setSubmitting(true);
    try {
      const newTask = await propertiesApi.createMaintenanceTask(
        activeLease.propertyId,
        {
          title: `[${form.area.toUpperCase()}][${form.urgency.toUpperCase()}] ${form.title}`,
          notes: form.description,
          scheduledAt: defaultTaskDate,
        },
      );
      setTasks((prev) => [newTask, ...prev]);
      setForm({ title: "", description: "", area: "other", urgency: "medium" });
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    } catch {
      // fail silently
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString(getLocaleCode(locale));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">
        {t("maintenance")}
      </h1>

      {/* Submit form */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
          {t("submitMaintenance")}
        </h2>

        {submitted && (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm mb-4 bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Solicitud enviada con éxito</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("title")}
            </label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
              disabled={!activeLease?.propertyId}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("description")}
            </label>
            <textarea
              required
              rows={3}
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              disabled={!activeLease?.propertyId}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("area")}
              </label>
              <select
                value={form.area}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    area: e.target.value as MaintenanceArea,
                  }))
                }
                disabled={!activeLease?.propertyId}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {AREAS.map((area) => (
                  <option key={area} value={area}>
                    {t(`maintenanceAreas.${area}` as Parameters<typeof t>[0])}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("urgency")}
              </label>
              <select
                value={form.urgency}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    urgency: e.target.value as UrgencyLevel,
                  }))
                }
                disabled={!activeLease?.propertyId}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {URGENCIES.map((u) => (
                  <option key={u} value={u}>
                    {t(`urgencyLevels.${u}` as Parameters<typeof t>[0])}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!activeLease?.propertyId && (
            <p className="text-xs text-orange-500">{t("noActiveContract")}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !activeLease?.propertyId}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("submitRequest")}
          </button>
        </form>
      </div>

      {/* History */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          {t("maintenanceHistory")}
        </h2>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700">
          {tasks.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center text-gray-400">
              {t("noMaintenanceRequests")}
            </p>
          ) : (
            tasks.map((task) => (
              <div key={task.id} className="px-4 py-3">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {task.title}
                </p>
                {task.notes && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {task.notes}
                  </p>
                )}
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {formatDate(task.scheduledAt)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

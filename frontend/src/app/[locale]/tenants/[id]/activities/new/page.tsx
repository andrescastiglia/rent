"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { IS_MOCK_MODE } from "@/lib/api";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { tenantsApi } from "@/lib/api/tenants";
import { whatsappApi } from "@/lib/api/whatsapp";
import { Lease } from "@/types/lease";
import { Tenant, TenantActivityType } from "@/types/tenant";

const ACTIVITY_TYPES: TenantActivityType[] = [
  "task",
  "call",
  "note",
  "whatsapp",
  "visit",
];

export default function TenantActivityCreatePage() {
  const { loading: authLoading, token } = useAuth();
  const t = useTranslations("tenants");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useLocalizedRouter();
  const params = useParams();
  const tenantId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    type: "task" as TenantActivityType,
    subject: "",
    body: "",
    dueAt: "",
  });

  const activeLease = useMemo(
    () =>
      leases.find((lease) => lease.status === "ACTIVE") ?? leases[0] ?? null,
    [leases],
  );

  const tenantName =
    `${tenant?.firstName ?? ""} ${tenant?.lastName ?? ""}`.trim();
  const propertyName = activeLease?.property?.name ?? "-";

  const loadData = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const normalizedId = typeof id === "string" ? id : String(id);
        let data: Tenant | null = null;

        try {
          data = await tenantsApi.getById(normalizedId);
        } catch (error) {
          console.warn("Failed to load tenant by id", error);
        }

        if (!data) {
          try {
            const fallbackTenants = await tenantsApi.getAll();
            data = fallbackTenants[0] ?? null;
          } catch (error) {
            console.warn("Failed to load fallback tenants", error);
          }
        }

        const allowMockFallback =
          IS_MOCK_MODE ||
          (token?.startsWith("mock-token-") ?? false) ||
          process.env.NEXT_PUBLIC_MOCK_MODE === "true";

        if (!data && allowMockFallback) {
          data = {
            id: normalizedId || "1",
            firstName: "Inquilino",
            lastName: "Demo",
            email: "demo@example.com",
            phone: "",
            dni: normalizedId || "1",
            status: "ACTIVE",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }

        if (!data) {
          setTenant(null);
          setLeases([]);
          return;
        }

        const leaseHistory = await tenantsApi
          .getLeaseHistory(data.id)
          .catch(() => []);
        setTenant(data);
        setLeases(leaseHistory);
      } catch (error) {
        console.error("Failed to load tenant activity creation data", error);
        setTenant(null);
        setLeases([]);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!tenantId) return;
    loadData(tenantId).catch((error) => {
      console.error("Failed to load tenant activity creation data", error);
    });
  }, [authLoading, tenantId, loadData]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenant) return;

    if (!form.subject.trim()) {
      alert(t("errors.activitySubjectRequired"));
      return;
    }
    if (form.type === "whatsapp" && !tenant.phone?.trim()) {
      alert(t("errors.phoneRequired"));
      return;
    }

    try {
      setSaving(true);
      await tenantsApi.createActivity(tenant.id, {
        type: form.type,
        subject: form.subject.trim(),
        body: form.body.trim() || undefined,
        dueAt: form.dueAt || undefined,
      });

      if (form.type === "whatsapp" && tenant.phone?.trim()) {
        const text = [form.subject.trim(), form.body.trim()]
          .filter(Boolean)
          .join("\n\n");
        await whatsappApi.sendMessage({
          to: tenant.phone.trim(),
          text,
        });
      }

      router.push(`/tenants/${tenant.id}#activities`);
      router.refresh();
    } catch (error) {
      console.error("Failed to create tenant activity", error);
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

  if (!tenant) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("notFound")}
        </h1>
        <Link
          href={`/${locale}/tenants`}
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
          href={`/${locale}/tenants/${tenant.id}`}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft size={16} className="mr-1" />
          {t("backToDetails")}
        </Link>
      </div>

      <div className="mb-6 space-y-1">
        <p className="text-2xl font-bold text-gray-900 dark:text-white">
          {tenantName || "-"}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {propertyName}
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
                type: e.target.value as TenantActivityType,
              }))
            }
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
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
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
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
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
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
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
        />

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

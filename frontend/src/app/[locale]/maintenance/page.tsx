"use client";
import { useAssistantRecord } from "@/hooks/useAssistantRecord";

import {
  SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { maintenanceApi } from "@/lib/api/maintenance";
import type {
  MaintenanceTicket,
  CreateMaintenanceTicketInput,
} from "@/types/maintenance";
import {
  MaintenanceTicketStatus,
  MaintenanceTicketPriority,
  MaintenanceTicketArea,
  MaintenanceTicketSource,
} from "@/types/maintenance";
import { useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";
import { RoleGuard } from "@/components/common/RoleGuard";
import { useAuth } from "@/contexts/auth-context";
import TicketDetailPanel, {
  PRIORITY_COLORS,
  STATUS_COLORS,
} from "@/components/maintenance/TicketDetailPanel";
import { canUserAccessModule } from "@/lib/permissions";

const STATUSES = Object.values(MaintenanceTicketStatus);
const PRIORITIES = Object.values(MaintenanceTicketPriority);
const AREAS = Object.values(MaintenanceTicketArea);

type CreateFormState = {
  title: string;
  propertyId: string;
  area: MaintenanceTicketArea;
  priority: MaintenanceTicketPriority;
  description: string;
  estimatedCost: string;
  scheduledAt: string;
};

const INITIAL_FORM: CreateFormState = {
  title: "",
  propertyId: "",
  area: MaintenanceTicketArea.OTHER,
  priority: MaintenanceTicketPriority.MEDIUM,
  description: "",
  estimatedCost: "",
  scheduledAt: "",
};

function CreateTicketForm({
  form,
  setForm,
  saving,
  onSubmit,
  onClose,
}: Readonly<{
  form: CreateFormState;
  setForm: React.Dispatch<React.SetStateAction<CreateFormState>>;
  saving: boolean;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onClose: () => void;
}>) {
  const t = useTranslations("maintenance");
  const tCommon = useTranslations("common");

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <label className="text-sm text-gray-700 md:col-span-2 dark:text-gray-300">
        {t("title")}
        <input
          required
          type="text"
          value={form.title}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, title: e.target.value }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </label>

      <label className="text-sm text-gray-700 dark:text-gray-300">
        {t("property")}
        <input
          required
          type="text"
          value={form.propertyId}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, propertyId: e.target.value }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </label>

      <label className="text-sm text-gray-700 dark:text-gray-300">
        {t("area")}
        <select
          required
          value={form.area}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              area: e.target.value as MaintenanceTicketArea,
            }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
          {AREAS.map((area) => (
            <option key={area} value={area}>
              {t(`areas.${area}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-gray-700 dark:text-gray-300">
        {t("priority")}
        <select
          required
          value={form.priority}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              priority: e.target.value as MaintenanceTicketPriority,
            }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {t(`priorities.${p}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-gray-700 dark:text-gray-300">
        {t("estimatedCost")}
        <input
          type="number"
          min="0"
          step="0.01"
          value={form.estimatedCost}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, estimatedCost: e.target.value }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </label>

      <label className="text-sm text-gray-700 dark:text-gray-300">
        {t("scheduledAt")}
        <input
          type="date"
          value={form.scheduledAt}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, scheduledAt: e.target.value }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </label>

      <label className="text-sm text-gray-700 md:col-span-2 dark:text-gray-300">
        {t("description")}
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, description: e.target.value }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </label>

      <div className="flex gap-2 md:col-span-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? tCommon("saving") : tCommon("create")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {tCommon("cancel")}
        </button>
      </div>
    </form>
  );
}

export default function MaintenancePage() {
  const t = useTranslations("maintenance");
  const tCommon = useTranslations("common");
  const { user } = useAuth();

  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<
    MaintenanceTicketStatus | ""
  >("");
  const [filterPriority, setFilterPriority] = useState<
    MaintenanceTicketPriority | ""
  >("");
  const [filterSearch, setFilterSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateFormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  const [selectedTicket, setSelectedTicket] =
    useState<MaintenanceTicket | null>(null);
  useAssistantRecord(maintenanceApi.getOne, setSelectedTicket);
  const currentLoad = useRef(0);

  const canManage = Boolean(
    user && canUserAccessModule(user, ["admin", "staff"], "maintenance"),
  );

  const load = useCallback(async () => {
    const requestId = ++currentLoad.current;
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await maintenanceApi.getAll({
        status: filterStatus || undefined,
        priority: filterPriority || undefined,
        search: filterSearch || undefined,
      });
      if (requestId === currentLoad.current) setTickets(data);
    } catch (err) {
      console.error("Failed to load tickets", err);
      if (requestId === currentLoad.current) setError(t("errors.load"));
    } finally {
      if (requestId === currentLoad.current) setLoading(false);
    }
  }, [canManage, filterStatus, filterPriority, filterSearch, t]);

  useEffect(() => {
    load().catch(console.error);
    return () => {
      currentLoad.current++;
    };
  }, [load, user?.id, user?.companyId]);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const openCreate = () => {
    clearMessages();
    setSelectedTicket(null);
    setForm(INITIAL_FORM);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(INITIAL_FORM);
  };

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    clearMessages();

    const input: CreateMaintenanceTicketInput = {
      title: form.title,
      propertyId: form.propertyId,
      area: form.area,
      priority: form.priority,
      description: form.description || undefined,
      estimatedCost: form.estimatedCost
        ? Number.parseFloat(form.estimatedCost)
        : undefined,
      scheduledAt: form.scheduledAt || undefined,
      source: MaintenanceTicketSource.ADMIN,
    };

    try {
      const created = await maintenanceApi.create(input);
      setTickets((prev) => [created, ...prev]);
      setSuccess(t("messages.created"));
      closeForm();
    } catch (err) {
      console.error("Failed to save ticket", err);
      setError(t("errors.save"));
    } finally {
      setSaving(false);
    }
  };

  const handleTicketUpdated = (updated: MaintenanceTicket) => {
    setTickets((prev) =>
      prev.map((tk) => (tk.id === updated.id ? updated : tk)),
    );
    setSelectedTicket(updated);
    setSuccess(t("messages.updated"));
  };

  const fmt = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("es-AR");

  return (
    <RoleGuard allowedRoles={["admin", "staff"]} requiredModule="maintenance">
      <section className="space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {t("title")}
          </h1>
          {canManage && !showForm && (
            <button
              type="button"
              onClick={openCreate}
              data-assistant-intent="create"
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              {t("newTicket")}
            </button>
          )}
        </header>

        {error ? (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400"
          >
            {error}
            <button
              type="button"
              onClick={() => void load()}
              className="ml-3 min-h-11 underline"
            >
              {tCommon("retry")}
            </button>
          </p>
        ) : null}
        {success ? (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
            {success}
          </p>
        ) : null}

        {showForm ? (
          <CreateTicketForm
            form={form}
            setForm={setForm}
            saving={saving}
            onSubmit={handleSubmit}
            onClose={closeForm}
          />
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor="maintenance-status-filter" className="sr-only">
              {t("status")}
            </label>
            <select
              id="maintenance-status-filter"
              value={filterStatus}
              onChange={(e) =>
                setFilterStatus(e.target.value as MaintenanceTicketStatus | "")
              }
              className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="">{t("status")}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`statuses.${s}`)}
                </option>
              ))}
            </select>
            <label htmlFor="maintenance-priority-filter" className="sr-only">
              {t("priority")}
            </label>
            <select
              id="maintenance-priority-filter"
              value={filterPriority}
              onChange={(e) =>
                setFilterPriority(
                  e.target.value as MaintenanceTicketPriority | "",
                )
              }
              className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="">{t("priority")}</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`priorities.${p}`)}
                </option>
              ))}
            </select>
            <label htmlFor="maintenance-search" className="sr-only">
              {tCommon("search")}
            </label>
            <input
              id="maintenance-search"
              type="search"
              placeholder={tCommon("search")}
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (
          !showForm && (
            <>
              {tickets.length === 0 ? (
                !error && (
                  <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center dark:border-gray-600">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {t("noTickets")}
                    </p>
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      {t("noTicketsDescription")}
                    </p>
                  </div>
                )
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        {(
                          [
                            ["title", t("title")],
                            ["property", t("property")],
                            ["priority", t("priority")],
                            ["status", t("status")],
                            ["assignedTo", t("assignedTo")],
                            ["createdAt", t("createdAt")],
                          ] as [string, string][]
                        ).map(([col, label]) => (
                          <th
                            key={col}
                            scope="col"
                            className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                      {tickets.map((tk) => (
                        <tr
                          key={tk.id}
                          onClick={() => {
                            setSelectedTicket(
                              selectedTicket?.id === tk.id ? null : tk,
                            );
                            clearMessages();
                          }}
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                            <button
                              type="button"
                              data-guide="maintenance-open"
                              data-assistant-intent="edit"
                              data-assistant-record={tk.id}
                              aria-expanded={selectedTicket?.id === tk.id}
                              className="min-h-11 text-left"
                            >
                              {tk.title}
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            {tk.property?.address ?? tk.propertyId}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_COLORS[tk.priority]}`}
                            >
                              {t(`priorities.${tk.priority}`)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[tk.status]}`}
                            >
                              {t(`statuses.${tk.status}`)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            {tk.assignedStaff
                              ? `${tk.assignedStaff.user.firstName} ${tk.assignedStaff.user.lastName}`
                              : "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            {fmt(tk.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedTicket ? (
                <TicketDetailPanel
                  ticket={selectedTicket}
                  canManage={canManage}
                  onClose={() => setSelectedTicket(null)}
                  onUpdated={handleTicketUpdated}
                />
              ) : null}
            </>
          )
        )}
      </section>
    </RoleGuard>
  );
}

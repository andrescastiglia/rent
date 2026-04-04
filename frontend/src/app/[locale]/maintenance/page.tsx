"use client";

import { SyntheticEvent, useCallback, useEffect, useState } from "react";
import { maintenanceApi } from "@/lib/api/maintenance";
import type {
  MaintenanceTicket,
  MaintenanceTicketComment,
  CreateMaintenanceTicketInput,
  UpdateMaintenanceTicketInput,
} from "@/types/maintenance";
import {
  MaintenanceTicketStatus,
  MaintenanceTicketPriority,
  MaintenanceTicketArea,
  MaintenanceTicketSource,
} from "@/types/maintenance";
import { useTranslations } from "next-intl";
import { Loader2, MessageSquare, Plus, X } from "lucide-react";
import { RoleGuard } from "@/components/common/RoleGuard";
import { useAuth } from "@/contexts/auth-context";

const STATUSES = Object.values(MaintenanceTicketStatus);
const PRIORITIES = Object.values(MaintenanceTicketPriority);
const AREAS = Object.values(MaintenanceTicketArea);

const PRIORITY_COLORS: Record<MaintenanceTicketPriority, string> = {
  [MaintenanceTicketPriority.LOW]: "bg-gray-100 text-gray-700",
  [MaintenanceTicketPriority.MEDIUM]: "bg-blue-100 text-blue-800",
  [MaintenanceTicketPriority.HIGH]: "bg-orange-100 text-orange-800",
  [MaintenanceTicketPriority.URGENT]: "bg-red-100 text-red-800",
};

const STATUS_COLORS: Record<MaintenanceTicketStatus, string> = {
  [MaintenanceTicketStatus.OPEN]: "bg-yellow-100 text-yellow-800",
  [MaintenanceTicketStatus.ASSIGNED]: "bg-blue-100 text-blue-800",
  [MaintenanceTicketStatus.IN_PROGRESS]: "bg-indigo-100 text-indigo-800",
  [MaintenanceTicketStatus.PENDING_PARTS]: "bg-orange-100 text-orange-800",
  [MaintenanceTicketStatus.RESOLVED]: "bg-green-100 text-green-800",
  [MaintenanceTicketStatus.CLOSED]: "bg-gray-100 text-gray-700",
  [MaintenanceTicketStatus.CANCELLED]: "bg-red-100 text-red-800",
};

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

function TicketDetailPanel({
  ticket,
  canManage,
  onClose,
  onUpdated,
}: Readonly<{
  ticket: MaintenanceTicket;
  canManage: boolean;
  onClose: () => void;
  onUpdated: (updated: MaintenanceTicket) => void;
}>) {
  const t = useTranslations("maintenance");
  const tCommon = useTranslations("common");

  const [comments, setComments] = useState<MaintenanceTicketComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentError, setCommentError] = useState<string | null>(null);

  const [newComment, setNewComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<MaintenanceTicketStatus>(
    ticket.status,
  );

  useEffect(() => {
    setSelectedStatus(ticket.status);
  }, [ticket.status]);

  useEffect(() => {
    let cancelled = false;
    setLoadingComments(true);
    setCommentError(null);
    maintenanceApi
      .getComments(ticket.id)
      .then((data) => {
        if (!cancelled) setComments(data);
      })
      .catch(() => {
        if (!cancelled) setCommentError(t("errors.loadComments"));
      })
      .finally(() => {
        if (!cancelled) setLoadingComments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticket.id, t]);

  const handleStatusUpdate = async () => {
    if (selectedStatus === ticket.status) return;
    setUpdatingStatus(true);
    try {
      const input: UpdateMaintenanceTicketInput = { status: selectedStatus };
      const updated = await maintenanceApi.update(ticket.id, input);
      onUpdated(updated);
    } catch {
      // status update failure is non-critical; parent will reload on next action
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAddComment = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmittingComment(true);
    setCommentError(null);
    try {
      const comment = await maintenanceApi.addComment(
        ticket.id,
        newComment.trim(),
        isInternal,
      );
      setComments((prev) => [...prev, comment]);
      setNewComment("");
    } catch {
      setCommentError(t("errors.addComment"));
    } finally {
      setSubmittingComment(false);
    }
  };

  const fmt = (dateStr?: string) =>
    dateStr ? new Date(dateStr).toLocaleDateString("es-AR") : "—";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {t("ticketDetails")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          aria-label={tCommon("close")}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-4 space-y-1">
        <h3 className="text-base font-medium text-gray-900 dark:text-white">
          {ticket.title}
        </h3>
        <div className="flex flex-wrap gap-2">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_COLORS[ticket.priority]}`}
          >
            {t(`priorities.${ticket.priority}`)}
          </span>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[ticket.status]}`}
          >
            {t(`statuses.${ticket.status}`)}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-gray-500 dark:text-gray-400">
            {t("property")}
          </dt>
          <dd className="text-gray-900 dark:text-white">
            {ticket.property?.address ?? ticket.propertyId}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500 dark:text-gray-400">
            {t("area")}
          </dt>
          <dd className="text-gray-900 dark:text-white">
            {t(`areas.${ticket.area}`)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500 dark:text-gray-400">
            {t("source")}
          </dt>
          <dd className="text-gray-900 dark:text-white">
            {t(`sources.${ticket.source}`)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500 dark:text-gray-400">
            {t("createdAt")}
          </dt>
          <dd className="text-gray-900 dark:text-white">
            {fmt(ticket.createdAt)}
          </dd>
        </div>
        {ticket.reportedBy ? (
          <div>
            <dt className="font-medium text-gray-500 dark:text-gray-400">
              {t("reportedBy")}
            </dt>
            <dd className="text-gray-900 dark:text-white">
              {ticket.reportedBy.firstName} {ticket.reportedBy.lastName}
            </dd>
          </div>
        ) : null}
        {ticket.assignedStaff ? (
          <div>
            <dt className="font-medium text-gray-500 dark:text-gray-400">
              {t("assignedTo")}
            </dt>
            <dd className="text-gray-900 dark:text-white">
              {ticket.assignedStaff.user.firstName}{" "}
              {ticket.assignedStaff.user.lastName}
            </dd>
          </div>
        ) : null}
        {ticket.scheduledAt ? (
          <div>
            <dt className="font-medium text-gray-500 dark:text-gray-400">
              {t("scheduledAt")}
            </dt>
            <dd className="text-gray-900 dark:text-white">
              {fmt(ticket.scheduledAt)}
            </dd>
          </div>
        ) : null}
        {ticket.resolvedAt ? (
          <div>
            <dt className="font-medium text-gray-500 dark:text-gray-400">
              {t("resolvedAt")}
            </dt>
            <dd className="text-gray-900 dark:text-white">
              {fmt(ticket.resolvedAt)}
            </dd>
          </div>
        ) : null}
        {ticket.estimatedCost != null && (
          <div>
            <dt className="font-medium text-gray-500 dark:text-gray-400">
              {t("estimatedCost")}
            </dt>
            <dd className="text-gray-900 dark:text-white">
              {ticket.estimatedCost} {ticket.costCurrency}
            </dd>
          </div>
        )}
        {ticket.actualCost != null && (
          <div>
            <dt className="font-medium text-gray-500 dark:text-gray-400">
              {t("actualCost")}
            </dt>
            <dd className="text-gray-900 dark:text-white">
              {ticket.actualCost} {ticket.costCurrency}
            </dd>
          </div>
        )}
        {ticket.externalRef ? (
          <div>
            <dt className="font-medium text-gray-500 dark:text-gray-400">
              {t("externalRef")}
            </dt>
            <dd className="text-gray-900 dark:text-white">
              {ticket.externalRef}
            </dd>
          </div>
        ) : null}
        {ticket.description ? (
          <div className="sm:col-span-2">
            <dt className="font-medium text-gray-500 dark:text-gray-400">
              {t("description")}
            </dt>
            <dd className="text-gray-900 dark:text-white">
              {ticket.description}
            </dd>
          </div>
        ) : null}
        {ticket.resolutionNotes ? (
          <div className="sm:col-span-2">
            <dt className="font-medium text-gray-500 dark:text-gray-400">
              {t("resolutionNotes")}
            </dt>
            <dd className="text-gray-900 dark:text-white">
              {ticket.resolutionNotes}
            </dd>
          </div>
        ) : null}
      </dl>

      {canManage && (
        <div className="mt-4 flex items-center gap-2">
          <select
            value={selectedStatus}
            onChange={(e) =>
              setSelectedStatus(e.target.value as MaintenanceTicketStatus)
            }
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`statuses.${s}`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={updatingStatus || selectedStatus === ticket.status}
            onClick={() => {
              handleStatusUpdate().catch(console.error);
            }}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {updatingStatus && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("updateStatus")}
          </button>
        </div>
      )}

      <div className="mt-6">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          <MessageSquare className="h-4 w-4" />
          {t("comments")}
        </h3>

        {loadingComments ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-3">
            {comments.map((c) => (
              <div
                key={c.id}
                className={`rounded-md border p-3 text-sm ${
                  c.isInternal
                    ? "border-yellow-200 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/20"
                    : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-700/30"
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  {c.user ? (
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {c.user.firstName} {c.user.lastName}
                    </span>
                  ) : null}
                  {c.isInternal && (
                    <span className="rounded-full bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700 dark:bg-yellow-800 dark:text-yellow-200">
                      {t("internalComment")}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-gray-400">
                    {new Date(c.createdAt).toLocaleDateString("es-AR")}
                  </span>
                </div>
                <p className="text-gray-800 dark:text-gray-200">{c.body}</p>
              </div>
            ))}
          </div>
        )}

        {commentError ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {commentError}
          </p>
        ) : null}

        <form onSubmit={handleAddComment} className="mt-3 space-y-2">
          <textarea
            rows={2}
            placeholder={t("addComment")}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
          {canManage && (
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={isInternal}
                onChange={(e) => setIsInternal(e.target.checked)}
                className="rounded"
              />
              {t("internalComment")}
            </label>
          )}
          <button
            type="submit"
            disabled={submittingComment || !newComment.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submittingComment && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("submitComment")}
          </button>
        </form>
      </div>
    </div>
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

  const canManage = user?.role === "admin" || user?.role === "staff";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await maintenanceApi.getAll({
        status: filterStatus || undefined,
        priority: filterPriority || undefined,
        search: filterSearch || undefined,
      });
      setTickets(data);
    } catch (err) {
      console.error("Failed to load tickets", err);
      setError(t("errors.load"));
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterPriority, filterSearch, t]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

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
    <RoleGuard allowedRoles={["admin", "staff"]}>
      <section className="space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {t("title")}
          </h1>
          {canManage && !showForm && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              {t("newTicket")}
            </button>
          )}
        </header>

        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
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
            <select
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
            <select
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
            <input
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
                <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center dark:border-gray-600">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {t("noTickets")}
                  </p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    {t("noTicketsDescription")}
                  </p>
                </div>
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
                            {tk.title}
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

"use client";
import { SyntheticEvent, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, MessageSquare, X } from "lucide-react";
import { maintenanceApi } from "@/lib/api/maintenance";
import type {
  MaintenanceTicket,
  MaintenanceTicketComment,
  UpdateMaintenanceTicketInput,
} from "@/types/maintenance";
import {
  MaintenanceTicketStatus,
  MaintenanceTicketPriority,
} from "@/types/maintenance";
import MaintenanceAttachments from "@/components/documents/MaintenanceAttachments";
const STATUSES = Object.values(MaintenanceTicketStatus);
export const PRIORITY_COLORS: Record<MaintenanceTicketPriority, string> = {
  [MaintenanceTicketPriority.LOW]: "bg-gray-100 text-gray-700",
  [MaintenanceTicketPriority.MEDIUM]: "bg-blue-100 text-blue-800",
  [MaintenanceTicketPriority.HIGH]: "bg-orange-100 text-orange-800",
  [MaintenanceTicketPriority.URGENT]: "bg-red-100 text-red-800",
};

export const STATUS_COLORS: Record<MaintenanceTicketStatus, string> = {
  [MaintenanceTicketStatus.OPEN]: "bg-yellow-100 text-yellow-800",
  [MaintenanceTicketStatus.ASSIGNED]: "bg-blue-100 text-blue-800",
  [MaintenanceTicketStatus.IN_PROGRESS]: "bg-indigo-100 text-indigo-800",
  [MaintenanceTicketStatus.PENDING_PARTS]: "bg-orange-100 text-orange-800",
  [MaintenanceTicketStatus.RESOLVED]: "bg-green-100 text-green-800",
  [MaintenanceTicketStatus.CLOSED]: "bg-gray-100 text-gray-700",
  [MaintenanceTicketStatus.CANCELLED]: "bg-red-100 text-red-800",
};

export default function TicketDetailPanel({
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
      setCommentError(t("errors.updateStatus"));
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
    <div
      data-assistant-ready
      data-assistant-record={ticket.id}
      className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
    >
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
          <label htmlFor="maintenance-ticket-status" className="sr-only">
            {t("status")}
          </label>
          <select
            id="maintenance-ticket-status"
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
        <MaintenanceAttachments ticketId={ticket.id} />
      </div>
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
            aria-label={t("addComment")}
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

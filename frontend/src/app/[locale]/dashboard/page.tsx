"use client";

import { useAuth } from "@/contexts/auth-context";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  dashboardApi,
  DashboardOperationsOverview,
  PeopleActivityResponse,
  PersonActivityItem,
  PersonActivityStatus,
} from "@/lib/api/dashboard";
import { formatMoneyByCode, normalizeRoundedNumber } from "@/lib/format-money";
import PendingActionReviewDialog from "@/components/ai/PendingActionReviewDialog";
import {
  Button,
  Dialog,
  PageHeader,
  StatePanel,
  Surface,
} from "@/components/ui";
import { formatCalendarDate } from "@/lib/calendar-date";

const STATUS_COLORS: Record<PersonActivityStatus, string> = {
  pending:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  completed:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function getMetricValue(value: number | null | undefined): number | string {
  return value == null ? "—" : normalizeRoundedNumber(value, 0);
}

function shouldShowEmptyState(
  loading: boolean,
  items: ReadonlyArray<unknown> | null | undefined,
): boolean {
  return !loading && items?.length === 0;
}

export default function DashboardPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations("dashboard");
  const tr = useTranslations("actionReview");
  const locale = useLocale();
  const [overview, setOverview] = useState<DashboardOperationsOverview | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(false);
  const [activityError, setActivityError] = useState(false);
  const [peopleActivity, setPeopleActivity] =
    useState<PeopleActivityResponse | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityLimit, setActivityLimit] = useState<10 | 25 | 50>(25);
  const [updatingActivityId, setUpdatingActivityId] = useState<string | null>(
    null,
  );
  const [editingActivity, setEditingActivity] =
    useState<PersonActivityItem | null>(null);
  const [editingComment, setEditingComment] = useState("");
  const [approvalItem, setApprovalItem] = useState<PersonActivityItem | null>(
    null,
  );
  const [reauthPassword, setReauthPassword] = useState("");
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      setOverviewError(false);
      const data = await dashboardApi.getOperationsOverview();
      setOverview(data);
    } catch (error) {
      setOverviewError(true);
      console.error("Error fetching dashboard operations overview:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPeopleActivity = useCallback(async () => {
    setActivityLoading(true);
    setActivityError(false);
    try {
      const data = await dashboardApi.getRecentActivity(activityLimit);
      setPeopleActivity(data);
    } catch (error) {
      setActivityError(true);
      console.error("Error fetching people activity:", error);
    } finally {
      setActivityLoading(false);
    }
  }, [activityLimit]);

  useEffect(() => {
    if (authLoading) return;
    fetchOverview().catch((error) => {
      console.error("Error fetching dashboard overview:", error);
    });
  }, [authLoading, fetchOverview]);

  useEffect(() => {
    if (authLoading) return;
    fetchPeopleActivity().catch((error) => {
      console.error("Error fetching people activity:", error);
    });
  }, [authLoading, fetchPeopleActivity]);

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "-";
    return formatCalendarDate(dateStr, locale);
  };

  const formatDateTime = (dateStr: string | null): string => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString(locale, {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  const handleCompleteActivity = async (activity: PersonActivityItem) => {
    try {
      setUpdatingActivityId(activity.id);
      await dashboardApi.completePersonActivity(activity);
      await fetchPeopleActivity();
    } catch (error) {
      console.error("Failed to complete activity", error);
      setActivityError(true);
    } finally {
      setUpdatingActivityId(null);
    }
  };

  const closeEditCommentDialog = () => {
    setEditingActivity(null);
    setEditingComment("");
  };

  const closeApprovalDialog = () => {
    setApprovalItem(null);
    setReauthPassword("");
    setApprovalError(null);
  };

  const handleEditComment = (activity: PersonActivityItem) => {
    setEditingActivity(activity);
    setEditingComment(activity.body ?? "");
  };

  const handleSaveComment = async () => {
    if (!editingActivity) return;
    try {
      setUpdatingActivityId(editingActivity.id);
      await dashboardApi.updatePersonActivityComment(
        editingActivity,
        editingComment,
      );
      await fetchPeopleActivity();
      closeEditCommentDialog();
    } catch (error) {
      console.error("Failed to edit activity comment", error);
      setActivityError(true);
    } finally {
      setUpdatingActivityId(null);
    }
  };

  const handleQueuedAction = async (
    item: PersonActivityItem,
    action: "approve" | "reject" | "reply" | "read",
  ) => {
    if (!item.actionId) return;
    try {
      setUpdatingActivityId(item.id);
      if (action === "reply") {
        const body = window.prompt(t("peopleActivity.replyPrompt"));
        if (!body?.trim()) return;
        await dashboardApi.replyCommunication(item.actionId, body.trim());
      } else if (action === "read") {
        await dashboardApi.markCommunicationRead(item.actionId);
      } else if (action === "approve") {
        setApprovalError(null);
        setApprovalItem(item);
        return;
      } else {
        const reason =
          window.prompt(t("peopleActivity.rejectPrompt")) ?? undefined;
        await dashboardApi.rejectPendingAction(item.actionId, reason);
      }
      await fetchPeopleActivity();
    } catch (error) {
      console.error("Failed to process queued action", error);
      setActivityError(true);
    } finally {
      setUpdatingActivityId(null);
    }
  };

  const confirmPendingAction = async () => {
    if (!approvalItem?.actionId || !reauthPassword) return;
    try {
      setUpdatingActivityId(approvalItem.id);
      const reauthToken = await dashboardApi.reauthenticate(reauthPassword);
      await dashboardApi.approvePendingAction(
        approvalItem.actionId,
        reauthToken,
      );
      closeApprovalDialog();
      await fetchPeopleActivity();
    } catch (error) {
      console.error("Failed to approve pending action", error);
      setApprovalError(
        error instanceof Error
          ? error.message
          : t("peopleActivity.approveError"),
      );
    } finally {
      setUpdatingActivityId(null);
    }
  };

  const renderActivityActions = (item: PersonActivityItem) => {
    if (item.actionKind === "communication")
      return (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleQueuedAction(item, "reply")}
            disabled={updatingActivityId === item.id}
            className="px-2 py-1 rounded-sm bg-green-600 text-white disabled:opacity-50"
          >
            {t("peopleActivity.actions.reply")}
          </button>
          <button
            type="button"
            onClick={() => void handleQueuedAction(item, "read")}
            disabled={updatingActivityId === item.id}
            className="px-2 py-1 rounded-sm bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 disabled:opacity-50"
          >
            {t("peopleActivity.actions.markRead")}
          </button>
        </div>
      );
    if (item.actionKind === "pending_action")
      return (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleQueuedAction(item, "approve")}
            disabled={updatingActivityId === item.id}
            className="px-2 py-1 rounded-sm bg-green-600 text-white disabled:opacity-50"
          >
            {t(
              item.canRetry
                ? "peopleActivity.actions.retry"
                : "peopleActivity.actions.approve",
            )}
          </button>
          {!item.canRetry && (
            <button
              type="button"
              onClick={() => void handleQueuedAction(item, "reject")}
              disabled={updatingActivityId === item.id}
              className="px-2 py-1 rounded-sm bg-red-600 text-white disabled:opacity-50"
            >
              {t("peopleActivity.actions.reject")}
            </button>
          )}
        </div>
      );
    if (item.actionKind === "registration")
      return (
        <Link
          href={`/${locale}/users`}
          className="text-blue-600 hover:underline"
        >
          {t("peopleActivity.actions.review")}
        </Link>
      );
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleCompleteActivity(item)}
          disabled={updatingActivityId === item.id}
          className="px-2 py-1 rounded-sm bg-green-600 text-white disabled:opacity-50"
        >
          {t("peopleActivity.actions.complete")}
        </button>
        <button
          type="button"
          onClick={() => handleEditComment(item)}
          disabled={updatingActivityId === item.id}
          className="px-2 py-1 rounded-sm bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 disabled:opacity-50"
        >
          {t("peopleActivity.actions.editComment")}
        </button>
      </div>
    );
  };

  const renderPeopleTable = (
    items: PersonActivityItem[],
    emptyLabel: string,
  ) => {
    if (items.length === 0) {
      return (
        <p className="text-sm text-gray-600 dark:text-gray-400">{emptyLabel}</p>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <th className="px-4 py-2">
                {t("peopleActivity.columns.person")}
              </th>
              <th className="px-4 py-2">
                {t("peopleActivity.columns.subject")}
              </th>
              <th className="px-4 py-2">{t("peopleActivity.columns.dueAt")}</th>
              <th className="px-4 py-2">
                {t("peopleActivity.columns.status")}
              </th>
              <th className="px-4 py-2">
                {t("peopleActivity.columns.actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-gray-200 dark:border-gray-700 last:border-b-0"
              >
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                  {item.personName}
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t(`peopleActivity.sources.${item.sourceType}`)}
                    {item.propertyName ? ` · ${item.propertyName}` : ""}
                  </p>
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                  {item.subject}
                  {item.body ? (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {item.body}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                  {formatDateTime(item.dueAt)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[item.status]}`}
                  >
                    {t(`peopleActivity.statuses.${item.status}`)}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {renderActivityActions(item)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const propertyPanel = overview?.propertiesPanel;
  const paymentsPanel = overview?.paymentsPanel;

  let panelContent1;
  if (activityError) {
    panelContent1 = (
      <StatePanel
        error
        title={tr("activityError")}
        action={
          <Button
            variant="secondary"
            onClick={() => void fetchPeopleActivity()}
          >
            {tr("retryPanel")}
          </Button>
        }
      />
    );
  } else if (activityLoading) {
    panelContent1 = (
      <p className="text-gray-600 dark:text-gray-400">{t("loading")}</p>
    );
  } else {
    panelContent1 = (
      <>
        <section>
          <h2 className="text-md font-semibold text-red-700 dark:text-red-400 mb-3">
            {t("peopleActivity.overdueTitle")}
          </h2>
          {renderPeopleTable(
            peopleActivity?.overdue ?? [],
            t("peopleActivity.noOverdue"),
          )}
        </section>
        <section>
          <h2 className="text-md font-semibold text-blue-700 dark:text-blue-400 mb-3">
            {t("peopleActivity.todayTitle")}
          </h2>
          {renderPeopleTable(
            peopleActivity?.today ?? [],
            t("peopleActivity.noToday"),
          )}
        </section>
        <section>
          <h2 className="text-md font-semibold text-green-700 dark:text-green-400 mb-3">
            {t("peopleActivity.newTitle")}
          </h2>
          {renderPeopleTable(
            peopleActivity?.new ?? [],
            t("peopleActivity.noNew"),
          )}
        </section>
      </>
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title={tr("dashboardTitle")}
        description={tr("dashboardDescription")}
      />
      {overviewError && (
        <StatePanel
          error
          title={tr("loadError")}
          action={
            <Button variant="secondary" onClick={() => void fetchOverview()}>
              {tr("retryPanel")}
            </Button>
          }
        />
      )}
      <div id="pending-actions" className="ui-surface scroll-mt-24">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {t("peopleActivity.title")}
          </h2>
          <label htmlFor="dashboard-activity-limit" className="sr-only">
            {t("peopleActivity.title")}
          </label>
          <select
            id="dashboard-activity-limit"
            value={activityLimit}
            onChange={(e) =>
              setActivityLimit(Number(e.target.value) as 10 | 25 | 50)
            }
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value={10}>{t("activity.show", { count: 10 })}</option>
            <option value={25}>{t("activity.show", { count: 25 })}</option>
            <option value={50}>{t("activity.show", { count: 50 })}</option>
          </select>
        </div>

        <div className="p-6 space-y-6">{panelContent1}</div>
      </div>

      <Surface className="p-5">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-muted">
              {t("workspace.saleProperties")}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {loading ? "…" : getMetricValue(propertyPanel?.saleCount)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted">
              {t("workspace.activeContracts")}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {loading ? "…" : getMetricValue(propertyPanel?.rentalActiveCount)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted">
              {t("workspace.renewalsThisMonth")}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {loading
                ? "…"
                : getMetricValue(propertyPanel?.expiringThisMonthCount)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted">
              {t("workspace.overdueInvoices")}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {loading ? "…" : getMetricValue(paymentsPanel?.overdueInvoices)}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={`/${locale}/payments`}
            className="btn btn-primary"
            data-guide="attention"
          >
            {t("workspace.openPayments")}
          </Link>
          <Link href={`/${locale}/leases`} className="btn btn-secondary">
            {t("workspace.openContracts")}
          </Link>
          <Link href={`/${locale}/properties`} className="btn btn-secondary">
            {t("workspace.openProperties")}
          </Link>
        </div>
      </Surface>
      <Surface className="p-5">
        <details>
          <summary className="min-h-11 cursor-pointer font-semibold">
            {t("workspace.information")}
          </summary>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="mb-3 text-sm font-semibold">
                {t("workspace.contractsEnding")}
              </h2>
              <ul className="space-y-3">
                {propertyPanel?.expiringThisMonth.map((lease) => (
                  <li key={lease.leaseId}>
                    <Link
                      href={`/${locale}/leases/${lease.leaseId}`}
                      className="action-link action-link-primary"
                    >
                      {lease.propertyName} · {formatDate(lease.endDate)}
                    </Link>
                  </li>
                ))}
              </ul>
              {shouldShowEmptyState(
                loading,
                propertyPanel?.expiringThisMonth,
              ) && (
                <p className="text-sm text-muted">{t("workspace.noEndings")}</p>
              )}
            </section>
            <section>
              <h2 className="mb-3 text-sm font-semibold">
                {t("workspace.recordedMovements")}
              </h2>
              <ul className="space-y-3">
                {paymentsPanel?.recentPayments.map((payment) => (
                  <li
                    key={payment.paymentId}
                    className="flex flex-wrap justify-between gap-2 border-t border-line pt-3"
                  >
                    <Link
                      href={`/${locale}/payments/${payment.paymentId}`}
                      className="action-link action-link-primary"
                    >
                      {payment.propertyName || t("workspace.payment")} ·{" "}
                      {formatDate(payment.paymentDate)}
                    </Link>
                    <span className="self-center font-semibold tabular-nums">
                      {formatMoneyByCode(
                        payment.amount,
                        payment.currencyCode,
                        locale,
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {shouldShowEmptyState(loading, paymentsPanel?.recentPayments) && (
                <p className="text-sm text-muted">
                  {t("workspace.noMovements")}
                </p>
              )}
            </section>
          </div>
        </details>
      </Surface>

      {editingActivity ? (
        <Dialog
          open
          onClose={closeEditCommentDialog}
          title={t("peopleActivity.editCommentTitle")}
          busy={updatingActivityId === editingActivity.id}
        >
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {t("peopleActivity.editCommentTitle")}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {editingActivity.subject}
            </p>
          </div>
          <div className="p-4">
            <label htmlFor="dashboard-activity-comment" className="sr-only">
              {t("peopleActivity.editCommentTitle")}
            </label>
            <textarea
              id="dashboard-activity-comment"
              value={editingComment}
              onChange={(e) => setEditingComment(e.target.value)}
              rows={5}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm text-gray-900 dark:text-white"
              placeholder={t("peopleActivity.editCommentPlaceholder")}
            />
          </div>
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeEditCommentDialog}
              disabled={updatingActivityId === editingActivity.id}
              className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200"
            >
              {t("peopleActivity.actions.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void handleSaveComment()}
              disabled={updatingActivityId === editingActivity.id}
              className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm disabled:opacity-50"
            >
              {t("peopleActivity.actions.save")}
            </button>
          </div>
        </Dialog>
      ) : null}

      <PendingActionReviewDialog
        item={approvalItem}
        password={reauthPassword}
        error={approvalError}
        busy={updatingActivityId === approvalItem?.id}
        onPasswordChange={setReauthPassword}
        onCancel={closeApprovalDialog}
        onConfirm={() => void confirmPendingAction()}
      />
    </div>
  );
}

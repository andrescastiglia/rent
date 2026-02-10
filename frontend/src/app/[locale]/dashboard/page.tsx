'use client';

import { useAuth } from '@/contexts/auth-context';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  dashboardApi,
  DashboardStats,
  PeopleActivityResponse,
  PersonActivityItem,
  PersonActivityStatus,
} from '@/lib/api/dashboard';
import { formatMoneyByCode } from '@/lib/format-money';

const STATUS_COLORS: Record<PersonActivityStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [peopleActivity, setPeopleActivity] = useState<PeopleActivityResponse | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityLimit, setActivityLimit] = useState<10 | 25 | 50>(25);
  const [updatingActivityId, setUpdatingActivityId] = useState<string | null>(null);
  const [editingActivity, setEditingActivity] = useState<PersonActivityItem | null>(null);
  const [editingComment, setEditingComment] = useState('');

  const fetchStats = async () => {
    try {
      const data = await dashboardApi.getStats();
      setStats(data);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPeopleActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const data = await dashboardApi.getRecentActivity(activityLimit);
      setPeopleActivity(data);
    } catch (error) {
      console.error('Error fetching people activity:', error);
    } finally {
      setActivityLoading(false);
    }
  }, [activityLimit]);

  useEffect(() => {
    if (authLoading) return;
    void fetchStats();
  }, [authLoading]);

  useEffect(() => {
    if (authLoading) return;
    void fetchPeopleActivity();
  }, [authLoading, fetchPeopleActivity]);

  const formatDateTime = (dateStr: string | null): string => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString(locale, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  };

  const handleCompleteActivity = async (activity: PersonActivityItem) => {
    try {
      setUpdatingActivityId(activity.id);
      await dashboardApi.completePersonActivity(activity);
      await fetchPeopleActivity();
    } catch (error) {
      console.error('Failed to complete activity', error);
    } finally {
      setUpdatingActivityId(null);
    }
  };

  const handleEditComment = async (activity: PersonActivityItem) => {
    setEditingActivity(activity);
    setEditingComment(activity.body ?? '');
  };

  const handleSaveComment = async () => {
    if (!editingActivity) return;
    try {
      setUpdatingActivityId(editingActivity.id);
      await dashboardApi.updatePersonActivityComment(editingActivity, editingComment);
      await fetchPeopleActivity();
      setEditingActivity(null);
      setEditingComment('');
    } catch (error) {
      console.error('Failed to edit activity comment', error);
    } finally {
      setUpdatingActivityId(null);
    }
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
              <th className="px-4 py-2">{t('peopleActivity.columns.person')}</th>
              <th className="px-4 py-2">{t('peopleActivity.columns.subject')}</th>
              <th className="px-4 py-2">{t('peopleActivity.columns.dueAt')}</th>
              <th className="px-4 py-2">{t('peopleActivity.columns.status')}</th>
              <th className="px-4 py-2">{t('peopleActivity.columns.actions')}</th>
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
                    {item.sourceType}
                    {item.propertyName ? ` · ${item.propertyName}` : ''}
                  </p>
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                  {item.subject}
                  {item.body ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
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
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleCompleteActivity(item)}
                      disabled={updatingActivityId === item.id}
                      className="px-2 py-1 rounded bg-green-600 text-white disabled:opacity-50"
                    >
                      {t('peopleActivity.actions.complete')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditComment(item)}
                      disabled={updatingActivityId === item.id}
                      className="px-2 py-1 rounded bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 disabled:opacity-50"
                    >
                      {t('peopleActivity.actions.editComment')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {t('title')}
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          {t('welcome', { name: `${user?.firstName} ${user?.lastName}` })}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href={`/${locale}/properties`} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('stats.properties')}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{loading ? '...' : stats?.totalProperties ?? 0}</p>
        </Link>
        <Link href={`/${locale}/tenants`} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('stats.tenants')}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{loading ? '...' : stats?.totalTenants ?? 0}</p>
        </Link>
        <Link href={`/${locale}/leases`} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('stats.activeLeases')}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{loading ? '...' : stats?.activeLeases ?? 0}</p>
        </Link>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('stats.monthlyIncome')}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {loading ? '...' : formatMoneyByCode(stats?.monthlyIncome ?? 0, stats?.currencyCode ?? 'ARS', locale)}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('peopleActivity.title')}
          </h2>
          <select
            value={activityLimit}
            onChange={(e) => setActivityLimit(Number(e.target.value) as 10 | 25 | 50)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value={10}>{t('activity.show', { count: 10 })}</option>
            <option value={25}>{t('activity.show', { count: 25 })}</option>
            <option value={50}>{t('activity.show', { count: 50 })}</option>
          </select>
        </div>

        <div className="p-6 space-y-6">
          {activityLoading ? (
            <p className="text-gray-600 dark:text-gray-400">{t('loading')}</p>
          ) : (
            <>
              <section>
                <h3 className="text-md font-semibold text-red-700 dark:text-red-400 mb-3">
                  {t('peopleActivity.overdueTitle')}
                </h3>
                {renderPeopleTable(
                  peopleActivity?.overdue ?? [],
                  t('peopleActivity.noOverdue'),
                )}
              </section>
              <section>
                <h3 className="text-md font-semibold text-blue-700 dark:text-blue-400 mb-3">
                  {t('peopleActivity.todayTitle')}
                </h3>
                {renderPeopleTable(
                  peopleActivity?.today ?? [],
                  t('peopleActivity.noToday'),
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {editingActivity ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {t('peopleActivity.editCommentTitle')}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {editingActivity.subject}
              </p>
            </div>
            <div className="p-4">
              <textarea
                value={editingComment}
                onChange={(e) => setEditingComment(e.target.value)}
                rows={5}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm text-gray-900 dark:text-white"
                placeholder={t('peopleActivity.editCommentPlaceholder')}
              />
            </div>
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingActivity(null);
                  setEditingComment('');
                }}
                className="px-3 py-2 rounded-md bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 text-sm"
              >
                {t('peopleActivity.actions.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleSaveComment()}
                disabled={updatingActivityId === editingActivity.id}
                className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm disabled:opacity-50"
              >
                {t('peopleActivity.actions.save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

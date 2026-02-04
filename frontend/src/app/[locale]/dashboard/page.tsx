'use client';

import { useAuth } from '@/contexts/auth-context';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  dashboardApi,
  DashboardStats,
  RecentActivityResponse,
  RecentActivityItem,
  BillingJobStatus,
} from '@/lib/api/dashboard';
import { formatMoneyByCode } from '@/lib/format-money';

// Define which stats cards are visible for each role
const ROLE_STATS: Record<string, string[]> = {
  admin: ['properties', 'tenants', 'leases', 'income', 'commissions', 'payments', 'invoices'],
  owner: ['properties', 'tenants', 'leases', 'income', 'payments', 'invoices'],
  tenant: ['leases', 'payments', 'invoices'],
  staff: ['properties', 'tenants', 'leases', 'commissions', 'payments', 'invoices'],
};

// Status badge colors
const STATUS_COLORS: Record<BillingJobStatus, string> = {
  pending: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  running: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  partial_failure: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
};

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<RecentActivityResponse | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityLimit, setActivityLimit] = useState<10 | 25 | 50>(10);

  // Get visible stats for the current user role
  const visibleStats = ROLE_STATS[user?.role ?? 'tenant'] || ROLE_STATS.tenant;

  useEffect(() => {
    // Wait for auth to be ready before fetching
    if (authLoading) return;

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

    fetchStats();
  }, [authLoading]);

  useEffect(() => {
    // Wait for auth to be ready before fetching
    if (authLoading) return;

    const fetchActivity = async () => {
      setActivityLoading(true);
      try {
        const data = await dashboardApi.getRecentActivity(activityLimit);
        setRecentActivity(data);
      } catch (error) {
        console.error('Error fetching recent activity:', error);
      } finally {
        setActivityLoading(false);
      }
    };

    fetchActivity();
  }, [activityLimit, authLoading]);

  const formatDuration = (ms: number | null): string => {
    if (ms === null) return '-';
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatDateTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleString(locale, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  };

  const renderActivityItem = (item: RecentActivityItem) => {
    return (
      <tr key={item.id} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
          {t(`activity.jobTypes.${item.jobType}`)}
          {item.dryRun && (
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
              ({t('activity.dryRun')})
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[item.status]}`}>
            {t(`activity.statuses.${item.status}`)}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
          {formatDateTime(item.startedAt)}
        </td>
        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
          {formatDuration(item.durationMs)}
        </td>
        <td className="px-4 py-3 text-sm">
          <span className="text-green-600 dark:text-green-400">{item.recordsProcessed}</span>
          {item.recordsFailed > 0 && (
            <>
              {' / '}
              <span className="text-red-600 dark:text-red-400">{item.recordsFailed}</span>
            </>
          )}
          <span className="text-gray-500 dark:text-gray-400"> / {item.recordsTotal}</span>
        </td>
      </tr>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Properties Card */}
        {visibleStats.includes('properties') && (
          <Link href={`/${locale}/properties`} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('stats.properties')}
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {loading ? '...' : stats?.totalProperties ?? 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-blue-600 dark:text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
              </div>
            </div>
          </Link>
        )}

        {/* Tenants Card */}
        {visibleStats.includes('tenants') && (
          <Link href={`/${locale}/tenants`} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('stats.tenants')}
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {loading ? '...' : stats?.totalTenants ?? 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              </div>
            </div>
          </Link>
        )}

        {/* Leases Card */}
        {visibleStats.includes('leases') && (
          <Link href="/leases" className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('stats.activeLeases')}
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {loading ? '...' : stats?.activeLeases ?? 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/20 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-purple-600 dark:text-purple-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
            </div>
          </Link>
        )}

        {/* Monthly Income Card */}
        {visibleStats.includes('income') && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('stats.monthlyIncome')}
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {loading ? '...' : formatMoneyByCode(stats?.monthlyIncome ?? 0, stats?.currencyCode ?? 'ARS', locale)}
                </p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/20 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-yellow-600 dark:text-yellow-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* Monthly Commissions Card */}
        {visibleStats.includes('commissions') && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('stats.monthlyCommissions')}
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {loading ? '...' : formatMoneyByCode(stats?.monthlyCommissions ?? 0, stats?.currencyCode ?? 'ARS', locale)}
                </p>
              </div>
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/20 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-indigo-600 dark:text-indigo-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* Payments Card */}
        {visibleStats.includes('payments') && (
          <Link href="/payments" className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('stats.payments')}
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {loading ? '...' : stats?.totalPayments ?? 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-teal-100 dark:bg-teal-900/20 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-teal-600 dark:text-teal-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
            </div>
          </Link>
        )}

        {/* Invoices Card */}
        {visibleStats.includes('invoices') && (
          <Link href="/invoices" className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('stats.invoices')}
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {loading ? '...' : stats?.totalInvoices ?? 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-orange-600 dark:text-orange-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"
                  />
                </svg>
              </div>
            </div>
          </Link>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('recentActivity')}
          </h2>
          <select
            value={activityLimit}
            onChange={(e) => setActivityLimit(Number(e.target.value) as 10 | 25 | 50)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value={10}>{t('activity.show', { count: 10 })}</option>
            <option value={25}>{t('activity.show', { count: 25 })}</option>
            <option value={50}>{t('activity.show', { count: 50 })}</option>
          </select>
        </div>
        <div className="p-6">
          {activityLoading ? (
            <p className="text-gray-600 dark:text-gray-400">{t('loading')}</p>
          ) : recentActivity && recentActivity.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <th className="px-4 py-2">{t('activity.columns.jobType')}</th>
                    <th className="px-4 py-2">{t('activity.columns.status')}</th>
                    <th className="px-4 py-2">{t('activity.columns.startedAt')}</th>
                    <th className="px-4 py-2">{t('activity.columns.duration')}</th>
                    <th className="px-4 py-2">{t('activity.columns.records')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivity.items.map(renderActivityItem)}
                </tbody>
              </table>
              {recentActivity.total > activityLimit && (
                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                  {t('activity.totalJobs', { shown: recentActivity.items.length, total: recentActivity.total })}
                </p>
              )}
            </div>
          ) : (
            <p className="text-gray-600 dark:text-gray-400">
              {t('noRecentActivity')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useAuth } from '@/contexts/auth-context';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { dashboardApi, DashboardStats } from '@/lib/api/dashboard';
import { formatMoneyByCode } from '@/lib/format-money';

// Define which stats cards are visible for each role
const ROLE_STATS: Record<string, string[]> = {
  admin: ['properties', 'tenants', 'leases', 'income', 'payments', 'invoices'],
  owner: ['properties', 'tenants', 'leases', 'income', 'payments', 'invoices'],
  tenant: ['leases', 'payments', 'invoices'],
  staff: ['properties', 'tenants', 'leases', 'payments', 'invoices'],
};

export default function DashboardPage() {
  const { user } = useAuth();
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Get visible stats for the current user role
  const visibleStats = ROLE_STATS[user?.role ?? 'tenant'] || ROLE_STATS.tenant;

  useEffect(() => {
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
  }, []);

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
          <Link href="/properties" className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer">
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
          <Link href="/tenants" className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer">
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
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('recentActivity')}
          </h2>
        </div>
        <div className="p-6">
          <p className="text-gray-600 dark:text-gray-400">
            {t('noRecentActivity')}
          </p>
        </div>
      </div>
    </div>
  );
}

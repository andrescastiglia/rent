'use client';

import React from 'react';
import Link from 'next/link';
import { Lease } from '@/types/lease';
import { LeaseStatusBadge } from './LeaseStatusBadge';
import { Calendar, DollarSign, Home, User } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { formatMoney } from '@/lib/format-money';

interface LeaseCardProps {
  lease: Lease;
}

export function LeaseCard({ lease }: LeaseCardProps) {
  const t = useTranslations('leases');
  const locale = useLocale();

  return (
    <Link href={`/leases/${lease.id}`} className="block group">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden transition-transform duration-300 group-hover:-translate-y-1 group-hover:shadow-lg border border-gray-100 dark:border-gray-700 p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
              {lease.property?.name || t('unknownProperty')}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('unit')} {lease.unitId}
            </p>
          </div>
          <LeaseStatusBadge status={lease.status} />
        </div>

        <div className="space-y-3">
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
            <User size={16} className="mr-2 text-gray-400" />
            <span className="font-medium">
              {lease.tenant ? `${lease.tenant.firstName} ${lease.tenant.lastName}` : t('unknownTenant')}
            </span>
          </div>

          <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
            <Calendar size={16} className="mr-2 text-gray-400" />
            <span>
              {new Date(lease.startDate).toLocaleDateString(locale)} - {new Date(lease.endDate).toLocaleDateString(locale)}
            </span>
          </div>

          <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
            <DollarSign size={16} className="mr-2 text-gray-400" />
            <span className="font-semibold text-gray-900 dark:text-white">
              {formatMoney(lease.rentAmount, lease.currencyData, locale)}
            </span>
            <span className="text-gray-400 ml-1">{t('perMonth')}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

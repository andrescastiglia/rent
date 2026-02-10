'use client';

import React from 'react';
import Link from 'next/link';
import { Tenant } from '@/types/tenant';
import { User, Mail, Phone, MapPin, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

interface TenantCardProps {
  tenant: Tenant;
}

export function TenantCard({ tenant }: TenantCardProps) {
  const t = useTranslations('tenants');
  const tc = useTranslations('common');
  const locale = useLocale();

  const getStatusLabel = (status: string) => {
    const statusKey = status.toLowerCase() as 'active' | 'inactive' | 'pending';
    return t(`status.${statusKey}`);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg border border-gray-100 dark:border-gray-700 p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-300 mr-4">
            <User size={24} />
          </div>
          <div>
            <Link href={`/${locale}/tenants/${tenant.id}`} className="text-lg font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-300">
              {tenant.firstName} {tenant.lastName}
            </Link>
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${
              tenant.status === 'ACTIVE' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 
              tenant.status === 'INACTIVE' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
            }`}>
              {getStatusLabel(tenant.status)}
            </span>
          </div>
        </div>
      </div>
      
      <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
        <div className="flex items-center">
          <Mail size={16} className="mr-2 text-gray-400" />
          <span className="truncate">{tenant.email}</span>
        </div>
        <div className="flex items-center">
          <Phone size={16} className="mr-2 text-gray-400" />
          <span>{tenant.phone}</span>
        </div>
        {tenant.address && (
          <div className="flex items-center">
            <MapPin size={16} className="mr-2 text-gray-400" />
            <span className="truncate">
              {tenant.address.street} {tenant.address.number}, {tenant.address.city}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        <Link
          href={`/${locale}/tenants/${tenant.id}/edit`}
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-600 dark:text-gray-200 dark:hover:text-gray-100"
        >
          {tc('edit')}
        </Link>
        <Link
          href={`/${locale}/tenants/${tenant.id}#payment-registration`}
          className="inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:text-green-600 dark:text-green-300 dark:hover:text-green-200"
        >
          <Wallet size={14} />
          {t('paymentRegistration.submit')}
        </Link>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import { TenantForm } from '@/components/tenants/TenantForm';
import Link from 'next/link';
import { ArrowLeft, Loader2, Wallet } from 'lucide-react';
import { useParams } from 'next/navigation';
import { tenantsApi } from '@/lib/api/tenants';
import { Tenant } from '@/types/tenant';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';

export default function EditTenantPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations('tenants');
  const locale = useLocale();
  const params = useParams();
  const tenantId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (tenantId) {
      loadTenant(tenantId);
    }
  }, [tenantId, authLoading]);

  const loadTenant = async (id: string) => {
    try {
      const data = await tenantsApi.getById(id);
      setTenant(data);
    } catch (error) {
      console.error('Failed to load tenant', error);
    } finally {
      setLoading(false);
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('notFound')}</h1>
        <Link href={`/${locale}/tenants`} className="text-blue-600 hover:underline mt-4 inline-block">
          {t('backToList')}
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/tenants/${tenant.id}`} className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <ArrowLeft size={16} className="mr-1" />
            {t('backToDetails')}
          </Link>
          <Link
            href={`/${locale}/tenants/${tenant.id}#payment-registration`}
            className="inline-flex items-center px-3 py-1.5 rounded-md border border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-300 dark:hover:bg-green-900/20 text-sm"
          >
            <Wallet size={14} className="mr-1" />
            {t('paymentRegistration.submit')}
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">{t('editTenant')}</h1>
        <TenantForm initialData={tenant} isEditing />
      </div>
    </div>
  );
}

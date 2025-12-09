'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Tenant } from '@/types/tenant';
import { tenantsApi } from '@/lib/api/tenants';
import { Edit, ArrowLeft, User, Mail, Phone, MapPin, Trash2, Loader2, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLocalizedRouter } from '@/hooks/useLocalizedRouter';
import { useAuth } from '@/contexts/auth-context';

export default function TenantDetailPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations('tenants');
  const tCommon = useTranslations('common');
  const params = useParams();
  const router = useLocalizedRouter();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (params.id) {
      loadTenant(params.id as string);
    }
  }, [params.id, authLoading]);

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

  const handleDelete = async () => {
    if (!tenant || !confirm(t('confirmDelete'))) return;
    
    try {
      await tenantsApi.delete(tenant.id);
      router.push('/tenants');
    } catch (error) {
      console.error('Failed to delete tenant', error);
      alert(tCommon('error'));
    }
  };

  const getStatusLabel = (status: string) => {
    const statusKey = status.toLowerCase() as 'active' | 'inactive' | 'pending';
    return t(`status.${statusKey}`);
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
        <Link href="/tenants" className="text-blue-600 hover:underline mt-4 inline-block">
          {t('backToList')}
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/tenants" className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft size={16} className="mr-1" />
          {t('backToList')}
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8 border-b dark:border-gray-700 pb-6">
            <div className="flex items-center">
               <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-300 mr-6">
                  <User size={40} />
               </div>
               <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{tenant.firstName} {tenant.lastName}</h1>
                    <span className={`px-2 py-1 rounded text-xs font-semibold uppercase tracking-wide ${
                      tenant.status === 'ACTIVE' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 
                      tenant.status === 'INACTIVE' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                    }`}>
                      {getStatusLabel(tenant.status)}
                    </span>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400">ID: {tenant.dni}</p>
               </div>
            </div>
            <div className="flex space-x-2">
              <Link
                href={`/tenants/${tenant.id}/edit`}
                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Edit size={16} className="mr-2" />
                {tCommon('edit')}
              </Link>
              <button
                onClick={handleDelete}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                <Trash2 size={16} className="mr-2" />
                {tCommon('delete')}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <section>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('contactInfo')}</h2>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-center">
                    <Mail size={18} className="text-gray-400 mr-3" />
                    <span className="text-gray-700 dark:text-gray-300">{tenant.email}</span>
                  </div>
                  <div className="flex items-center">
                    <Phone size={18} className="text-gray-400 mr-3" />
                    <span className="text-gray-700 dark:text-gray-300">{tenant.phone}</span>
                  </div>
                </div>
              </section>

              {tenant.address && (
                <section>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('address')}</h2>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 flex items-start">
                    <MapPin size={18} className="text-gray-400 mr-3 mt-1" />
                    <span className="text-gray-700 dark:text-gray-300">
                      {tenant.address.street} {tenant.address.number}<br />
                      {tenant.address.city}, {tenant.address.state} {tenant.address.zipCode}
                    </span>
                  </div>
                </section>
              )}
            </div>

            <div className="space-y-6">
               <section>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('leaseHistory')}</h2>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400 italic border-2 border-dashed border-gray-200 dark:border-gray-600">
                   <FileText size={32} className="mx-auto mb-2 text-gray-400" />
                   {t('noActiveLeases')}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

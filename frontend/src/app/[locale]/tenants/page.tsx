'use client';

import React, { useEffect, useState } from 'react';
import { Tenant } from '@/types/tenant';
import { tenantsApi } from '@/lib/api/tenants';
import { TenantCard } from '@/components/tenants/TenantCard';
import { Search, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';

export default function TenantsPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations('tenants');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (authLoading) return;
    loadTenants();
  }, [authLoading]);

  useEffect(() => {
    if (authLoading) return;
    const handle = setTimeout(() => {
      setLoading(true);
      loadTenants(searchTerm.trim() ? { name: searchTerm.trim() } : undefined);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchTerm, authLoading]);

  const loadTenants = async (filters?: { name?: string }) => {
    try {
      const data = await tenantsApi.getAll(filters);
      setTenants(data);
    } catch (error) {
      console.error('Failed to load tenants', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTenants = tenants;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('subtitle')}</p>
        </div>
      </div>

      <div className="relative mb-8">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder={t('searchPlaceholder')}
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
        </div>
      ) : filteredTenants.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTenants.map((tenant) => (
            <TenantCard key={tenant.id} tenant={tenant} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">{t('noTenants')}</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('noTenantsDescription')}</p>
        </div>
      )}
    </div>
  );
}

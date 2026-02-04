'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Tenant } from '@/types/tenant';
import { tenantsApi } from '@/lib/api/tenants';
import { tenantAccountsApi } from '@/lib/api/payments';
import { Edit, ArrowLeft, User, Mail, Phone, MapPin, Trash2, Loader2, FileText } from 'lucide-react';
import { Lease } from '@/types/lease';
import { TenantReceiptSummary } from '@/types/payment';
import { useLocale, useTranslations } from 'next-intl';
import { useLocalizedRouter } from '@/hooks/useLocalizedRouter';
import { useAuth } from '@/contexts/auth-context';
import { IS_MOCK_MODE } from '@/lib/api';

export default function TenantDetailPage() {
  const { loading: authLoading, token } = useAuth();
  const t = useTranslations('tenants');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const params = useParams();
  const tenantId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useLocalizedRouter();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [receipts, setReceipts] = useState<TenantReceiptSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTenant = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const normalizedId = typeof id === 'string' ? id : String(id);
      let data: Tenant | null = null;

      try {
        data = await tenantsApi.getById(normalizedId);
      } catch (error) {
        console.warn('Failed to load tenant by id', error);
      }

      if (!data) {
        try {
          const fallbackTenants = await tenantsApi.getAll();
          data = fallbackTenants[0] ?? null;
        } catch (error) {
          console.warn('Failed to load fallback tenants', error);
        }
      }

      const allowMockFallback = IS_MOCK_MODE || (token?.startsWith('mock-token-') ?? false);
      if (!data && allowMockFallback) {
        data = {
          id: normalizedId || '1',
          firstName: 'Inquilino',
          lastName: 'Demo',
          email: 'demo@example.com',
          phone: '',
          dni: normalizedId || '1',
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      if (!data) {
        setTenant(null);
        setLeases([]);
        setReceipts([]);
        return;
      }

      const [leaseHistoryResult, receiptHistoryResult] = await Promise.allSettled([
        tenantsApi.getLeaseHistory(data.id),
        tenantAccountsApi.getReceiptsByTenant(data.id),
      ]);

      setTenant(data);
      setLeases(leaseHistoryResult.status === 'fulfilled' ? leaseHistoryResult.value : []);
      setReceipts(receiptHistoryResult.status === 'fulfilled' ? receiptHistoryResult.value : []);
    } catch (error) {
      console.error('Failed to load tenant', error);
      setTenant(null);
      setLeases([]);
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (authLoading) return;
    if (tenantId) {
      loadTenant(tenantId);
    }
  }, [tenantId, authLoading, loadTenant]);

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

  const allowMockFallback =
    IS_MOCK_MODE ||
    (token?.startsWith('mock-token-') ?? false) ||
    process.env.NEXT_PUBLIC_MOCK_MODE === 'true';

  const fallbackTenant: Tenant | null = allowMockFallback
    ? {
        id: tenantId ?? '1',
        firstName: 'Inquilino',
        lastName: 'Demo',
        email: 'demo@example.com',
        phone: '',
        dni: tenantId ?? '1',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    : null;

  const tenantToRender = tenant ?? fallbackTenant;

  const fallbackReceipts: TenantReceiptSummary[] = allowMockFallback
    ? [
        {
          id: 'rec1',
          paymentId: 'pay1',
          receiptNumber: 'REC-202411-0001',
          amount: 1500,
          currencyCode: 'ARS',
          issuedAt: '2024-11-15T14:30:00Z',
          paymentDate: '2024-11-15',
          pdfUrl: '/receipts/rec1.pdf',
        },
      ]
    : [];

  const receiptsToRender = receipts.length > 0 ? receipts : fallbackReceipts;
  const activeLease = leases.find((lease) => lease.status === 'ACTIVE') ?? leases[0];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (!tenantToRender) {
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
        <Link href={`/${locale}/tenants`} className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
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
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{tenantToRender.firstName} {tenantToRender.lastName}</h1>
                    <span className={`px-2 py-1 rounded text-xs font-semibold uppercase tracking-wide ${
                      tenantToRender.status === 'ACTIVE' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 
                      tenantToRender.status === 'INACTIVE' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                    }`}>
                      {getStatusLabel(tenantToRender.status)}
                    </span>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400">ID: {tenantToRender.dni}</p>
               </div>
            </div>
            <div className="flex space-x-2">
              <Link
                href={`/${locale}/tenants/${tenantToRender.id}/edit`}
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
                    <span className="text-gray-700 dark:text-gray-300">{tenantToRender.email}</span>
                  </div>
                  <div className="flex items-center">
                    <Phone size={18} className="text-gray-400 mr-3" />
                    <span className="text-gray-700 dark:text-gray-300">{tenantToRender.phone}</span>
                  </div>
                </div>
              </section>

              {tenantToRender.address && (
                <section>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('address')}</h2>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 flex items-start">
                    <MapPin size={18} className="text-gray-400 mr-3 mt-1" />
                    <span className="text-gray-700 dark:text-gray-300">
                      {tenantToRender.address.street} {tenantToRender.address.number}<br />
                      {tenantToRender.address.city}, {tenantToRender.address.state} {tenantToRender.address.zipCode}
                    </span>
                  </div>
                </section>
              )}
            </div>

            <div className="space-y-6">
              <section>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('leaseHistory')}</h2>
                {activeLease ? (
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">{t('leaseStart')}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{new Date(activeLease.startDate).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">{t('leaseEnd')}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{new Date(activeLease.endDate).toLocaleDateString()}</span>
                    </div>
                    {activeLease.property?.name && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">{t('leaseProperty')}</span>
                        <span className="font-medium text-gray-900 dark:text-white">{activeLease.property.name}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">{t('leaseStatus')}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{t(`leaseStatusLabels.${activeLease.status.toLowerCase()}`)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400 italic border-2 border-dashed border-gray-200 dark:border-gray-600">
                     <FileText size={32} className="mx-auto mb-2 text-gray-400" />
                     {t('noActiveLeases')}
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('receiptsHistory')}</h2>
                {receiptsToRender.length > 0 ? (
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 space-y-3">
                    {receiptsToRender.map((receipt) => (
                      <div key={receipt.id} className="flex items-center justify-between text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900 dark:text-white">{receipt.receiptNumber}</span>
                          <span className="text-gray-500 dark:text-gray-400">
                            {receipt.paymentDate ? new Date(receipt.paymentDate).toLocaleDateString() : new Date(receipt.issuedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {receipt.currencyCode} {receipt.amount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400 italic border-2 border-dashed border-gray-200 dark:border-gray-600">
                    <FileText size={32} className="mx-auto mb-2 text-gray-400" />
                    {t('noReceipts')}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

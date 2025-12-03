'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Lease } from '@/types/lease';
import { leasesApi } from '@/lib/api/leases';
import { LeaseStatusBadge } from '@/components/leases/LeaseStatusBadge';
import { Edit, ArrowLeft, FileText, Trash2, Loader2, Calendar, DollarSign, User, Home, Download } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { useLocalizedRouter } from '@/hooks/useLocalizedRouter';

export default function LeaseDetailPage() {
  const t = useTranslations('leases');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const params = useParams();
  const router = useLocalizedRouter();
  const [lease, setLease] = useState<Lease | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      loadLease(params.id as string);
    }
  }, [params.id]);

  const loadLease = async (id: string) => {
    try {
      const data = await leasesApi.getById(id);
      setLease(data);
    } catch (error) {
      console.error('Failed to load lease', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!lease || !confirm(t('confirmDelete'))) return;
    
    try {
      await leasesApi.delete(lease.id);
      router.push('/leases');
    } catch (error) {
      console.error('Failed to delete lease', error);
      alert(tCommon('error'));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (!lease) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('notFound')}</h1>
        <Link href="/leases" className="text-blue-600 hover:underline mt-4 inline-block">
          {t('backToList')}
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/leases" className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft size={16} className="mr-1" />
          {t('backToList')}
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8 border-b dark:border-gray-700 pb-6">
            <div>
               <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('leaseAgreement')}</h1>
                  <LeaseStatusBadge status={lease.status} />
               </div>
               <p className="text-gray-500 dark:text-gray-400">ID: {lease.id}</p>
            </div>
            <div className="flex space-x-2">
              <Link
                href={`/leases/${lease.id}/edit`}
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
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('propertyAndTenant')}</h2>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-4">
                  <div className="flex items-start">
                    <Home size={18} className="text-gray-400 mr-3 mt-1" />
                    <div>
                        <p className="font-medium text-gray-900 dark:text-white">{lease.property?.name || t('unknownProperty')}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t('unit')}: {lease.unitId}</p>
                        {lease.property?.address && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {lease.property.address.street} {lease.property.address.number}, {lease.property.address.city}
                            </p>
                        )}
                    </div>
                  </div>
                  <div className="flex items-start border-t border-gray-200 dark:border-gray-600 pt-4">
                    <User size={18} className="text-gray-400 mr-3 mt-1" />
                    <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                            {lease.tenant ? `${lease.tenant.firstName} ${lease.tenant.lastName}` : t('unknownTenant')}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{lease.tenant?.email}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{lease.tenant?.phone}</p>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('termsAndConditions')}</h2>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{lease.terms || t('noTerms')}</p>
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <section>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('financialDetails')}</h2>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-300 flex items-center"><DollarSign size={16} className="mr-2" /> {t('rentAmount')}</span>
                    <span className="font-bold text-gray-900 dark:text-white text-lg">${lease.rentAmount.toLocaleString(locale)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-300 flex items-center"><DollarSign size={16} className="mr-2" /> {t('securityDeposit')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">${lease.depositAmount.toLocaleString(locale)}</span>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('duration')}</h2>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-300 flex items-center"><Calendar size={16} className="mr-2" /> {t('startDate')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{new Date(lease.startDate).toLocaleDateString(locale)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-300 flex items-center"><Calendar size={16} className="mr-2" /> {t('endDate')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{new Date(lease.endDate).toLocaleDateString(locale)}</span>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('documents')}</h2>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    {lease.documents.length > 0 ? (
                        <ul className="space-y-2">
                            {lease.documents.map((doc, index) => (
                                <li key={index}>
                                    <a href={doc} className="flex items-center text-blue-600 hover:underline">
                                        <FileText size={16} className="mr-2" />
                                        {t('document')} {index + 1}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                            <p className="text-sm italic mb-2">{t('noDocuments')}</p>
                            <button className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800" disabled title="Not implemented yet">
                                <Download size={14} className="mr-1" /> {t('generatePdf')}
                            </button>
                        </div>
                    )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

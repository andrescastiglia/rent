'use client';

import React, { useEffect, useState } from 'react';
import { LeaseForm } from '@/components/leases/LeaseForm';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { leasesApi } from '@/lib/api/leases';
import { Lease } from '@/types/lease';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';

export default function EditLeasePage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations('leases');
  const params = useParams();
  const [lease, setLease] = useState<Lease | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (params.id) {
      loadLease(params.id as string);
    }
  }, [params.id, authLoading]);

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
        <Link href={`/leases/${lease.id}`} className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft size={16} className="mr-1" />
          {t('backToDetails')}
        </Link>
      </div>

      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">{t('editLease')}</h1>
        <LeaseForm initialData={lease} isEditing />
      </div>
    </div>
  );
}

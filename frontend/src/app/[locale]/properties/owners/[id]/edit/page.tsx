'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ownersApi } from '@/lib/api/owners';
import { Owner } from '@/types/owner';
import { OwnerForm } from '@/components/owners/OwnerForm';
import { useAuth } from '@/contexts/auth-context';

export default function EditOwnerPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations('properties');
  const locale = useLocale();
  const params = useParams();
  const ownerId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [owner, setOwner] = useState<Owner | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !ownerId) return;

    const loadOwner = async () => {
      try {
        const data = await ownersApi.getById(ownerId);
        setOwner(data);
      } catch (error) {
        console.error('Failed to load owner', error);
      } finally {
        setLoading(false);
      }
    };

    void loadOwner();
  }, [authLoading, ownerId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (!owner) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('noOwners')}</h1>
        <Link href={`/${locale}/properties`} className="text-blue-600 hover:underline mt-4 inline-block">
          {t('backToList')}
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/${locale}/properties`}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft size={16} className="mr-1" />
          {t('backToList')}
        </Link>
      </div>

      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">{t('editOwnerTitle')}</h1>
        <OwnerForm initialData={owner} isEditing />
      </div>
    </div>
  );
}

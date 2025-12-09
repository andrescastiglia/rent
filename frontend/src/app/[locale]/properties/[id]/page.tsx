'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { Property } from '@/types/property';
import { propertiesApi } from '@/lib/api/properties';
import { Edit, ArrowLeft, MapPin, Building, Trash2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLocalizedRouter } from '@/hooks/useLocalizedRouter';
import { useAuth } from '@/contexts/auth-context';

export default function PropertyDetailPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations('properties');
  const tCommon = useTranslations('common');
  const params = useParams();
  const router = useLocalizedRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (params.id) {
      loadProperty(params.id as string);
    }
  }, [params.id, authLoading]);

  const loadProperty = async (id: string) => {
    try {
      const data = await propertiesApi.getById(id);
      setProperty(data);
    } catch (error) {
      console.error('Failed to load property', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!property || !confirm(t('confirmDelete'))) return;
    
    try {
      await propertiesApi.delete(property.id);
      router.push('/properties');
    } catch (error) {
      console.error('Failed to delete property', error);
      alert(tCommon('error'));
    }
  };

  const getStatusLabel = (status: string) => {
    const statusKey = status.toLowerCase() as 'active' | 'inactive' | 'maintenance';
    return t(`status.${statusKey}`);
  };

  const getTypeLabel = (type: string) => {
    const typeKey = type.toLowerCase() as 'apartment' | 'house' | 'commercial' | 'office' | 'other';
    return t(`type.${typeKey}`);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('notFound')}</h1>
        <Link href="/properties" className="text-blue-600 hover:underline mt-4 inline-block">
          {t('backToList')}
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/properties" className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft size={16} className="mr-1" />
          {t('backToList')}
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="relative h-64 md:h-96 bg-gray-200 dark:bg-gray-700">
          {property.images.length > 0 ? (
            <Image
              src={property.images[0]}
              alt={property.name}
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <Building size={64} />
            </div>
          )}
          <div className="absolute top-4 right-4 flex space-x-2">
            <Link
              href={`/properties/${property.id}/edit`}
              className="p-2 bg-white/90 backdrop-blur-sm rounded-full text-gray-700 hover:text-blue-600 shadow-sm transition-colors"
              aria-label={tCommon('edit')}
            >
              <Edit size={20} />
            </Link>
            <button
              onClick={handleDelete}
              className="p-2 bg-white/90 backdrop-blur-sm rounded-full text-gray-700 hover:text-red-600 shadow-sm transition-colors"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-1 rounded text-xs font-semibold text-white uppercase tracking-wide ${
                  property.status === 'ACTIVE' ? 'bg-green-500' : 
                  property.status === 'MAINTENANCE' ? 'bg-yellow-500' : 'bg-red-500'
                }`}>
                  {getStatusLabel(property.status)}
                </span>
                <span className="px-2 py-1 rounded text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  {getTypeLabel(property.type)}
                </span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{property.name}</h1>
              <div className="flex items-center text-gray-500 dark:text-gray-400">
                <MapPin size={18} className="mr-1" />
                <span>
                  {property.address.street} {property.address.number}, {property.address.city}, {property.address.state}
                </span>
              </div>
            </div>
            <div className="text-right">
               {/* Add price or other summary info here if needed */}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-8">
              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">{t('description')}</h2>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                  {property.description || t('noDescription')}
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">{t('features')}</h2>
                {property.features.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {property.features.map((feature) => (
                      <div key={feature.id} className="flex items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                        <span className="text-gray-700 dark:text-gray-300 font-medium">{feature.name}</span>
                        {feature.value && <span className="ml-1 text-gray-500 dark:text-gray-400 text-sm">({feature.value})</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">{t('noFeatures')}</p>
                )}
              </section>
            </div>

            <div className="space-y-6">
              <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg border border-gray-100 dark:border-gray-600">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{t('propertyStats')}</h3>
                <dl className="space-y-3">
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">{t('totalUnits')}</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{property.units.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">{t('occupied')}</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{property.units.filter(u => u.status === 'OCCUPIED').length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">{t('vacant')}</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{property.units.filter(u => u.status === 'AVAILABLE').length}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

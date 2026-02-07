'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import {
  Property,
  PropertyMaintenanceTask,
  CreatePropertyMaintenanceTaskInput,
} from '@/types/property';
import { propertiesApi } from '@/lib/api/properties';
import {
  Edit,
  ArrowLeft,
  MapPin,
  Building,
  Trash2,
  Loader2,
  FilePlus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useLocalizedRouter } from '@/hooks/useLocalizedRouter';
import { useAuth } from '@/contexts/auth-context';

export default function PropertyDetailPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations('properties');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const params = useParams();
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useLocalizedRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [maintenanceTasks, setMaintenanceTasks] = useState<PropertyMaintenanceTask[]>([]);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [isSubmittingMaintenance, setIsSubmittingMaintenance] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const defaultTaskDate = useMemo(() => {
    const now = new Date();
    const offsetMinutes = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offsetMinutes * 60000);
    return local.toISOString().slice(0, 16);
  }, []);

  const [maintenanceForm, setMaintenanceForm] = useState({
    scheduledAt: defaultTaskDate,
    title: '',
    notes: '',
  });

  useEffect(() => {
    if (authLoading) return;
    if (propertyId) {
      loadProperty(propertyId);
    }
  }, [propertyId, authLoading]);

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [property?.id, property?.images?.length]);

  const loadProperty = async (id: string) => {
    try {
      const [data, visitData] = await Promise.all([
        propertiesApi.getById(id),
        propertiesApi.getMaintenanceTasks(id),
      ]);
      setProperty(data);
      setMaintenanceTasks(visitData);
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

  const getOperationStateLabel = (state?: string) => {
    const stateKey = (state ?? 'available').toLowerCase() as 'available' | 'rented' | 'leased' | 'sold';
    return t(`operationState.${stateKey}`);
  };

  const handleMaintenanceInputChange = (field: string, value: string) => {
    setMaintenanceForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddMaintenanceTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!property) return;

    setMaintenanceError(null);

    if (!maintenanceForm.title.trim()) {
      setMaintenanceError(t('maintenanceErrors.titleRequired'));
      return;
    }

    const parsedScheduledAt = new Date(maintenanceForm.scheduledAt);
    if (Number.isNaN(parsedScheduledAt.getTime())) {
      setMaintenanceError(t('maintenanceErrors.invalidDate'));
      return;
    }

    const payload: CreatePropertyMaintenanceTaskInput = {
      scheduledAt: parsedScheduledAt.toISOString(),
      title: maintenanceForm.title.trim(),
      notes: maintenanceForm.notes.trim() || undefined,
    };

    setIsSubmittingMaintenance(true);
    try {
      const newTask = await propertiesApi.createMaintenanceTask(property.id, payload);
      setMaintenanceTasks((prev) => [newTask, ...prev]);
      setMaintenanceForm((prev) => ({
        ...prev,
        title: '',
        notes: '',
      }));
    } catch (error) {
      console.error('Failed to save maintenance task', error);
      setMaintenanceError(tCommon('error'));
    } finally {
      setIsSubmittingMaintenance(false);
    }
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
        <Link href={`/${locale}/properties`} className="text-blue-600 hover:underline mt-4 inline-block">
          {t('backToList')}
        </Link>
      </div>
    );
  }

  const canCreateLease = (property.operations ?? []).some(
    (operation) => operation === 'rent' || operation === 'leasing',
  );
  const hasMultipleImages = property.images.length > 1;
  const currentImage = property.images[currentImageIndex] ?? property.images[0];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href={`/${locale}/properties`} className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft size={16} className="mr-1" />
          {t('backToList')}
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="relative h-64 md:h-96 bg-gray-200 dark:bg-gray-700">
          {currentImage ? (
            <Image
              src={currentImage}
              alt={property.name}
              fill
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <Building size={64} />
            </div>
          )}
          {hasMultipleImages && (
            <>
              <button
                type="button"
                onClick={() =>
                  setCurrentImageIndex(
                    (prev) =>
                      (prev - 1 + property.images.length) % property.images.length,
                  )
                }
                className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-black/45 text-white rounded-full hover:bg-black/65 transition-colors"
                aria-label={t('previousImage')}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() =>
                  setCurrentImageIndex(
                    (prev) => (prev + 1) % property.images.length,
                  )
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-black/45 text-white rounded-full hover:bg-black/65 transition-colors"
                aria-label={t('nextImage')}
              >
                <ChevronRight size={18} />
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/45 text-white text-xs px-2 py-1 rounded">
                {currentImageIndex + 1} / {property.images.length}
              </div>
            </>
          )}
          <div className="absolute top-4 right-4 flex space-x-2">
            <Link
              href={`/${locale}/properties/${property.id}/edit`}
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
                <span className="px-2 py-1 rounded text-xs font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                  {getOperationStateLabel(property.operationState)}
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
              {canCreateLease ? (
                <Link
                  href={`/${locale}/leases/new?propertyId=${property.id}&ownerId=${property.ownerId}`}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
                >
                  <FilePlus size={16} />
                  {t('createLease')}
                </Link>
              ) : null}
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

              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('maintenanceTasks')}</h2>
                </div>

                <form onSubmit={handleAddMaintenanceTask} className="space-y-4 bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-100 dark:border-gray-600">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="maintenanceDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fields.scheduledAt')}</label>
                      <input
                        id="maintenanceDate"
                        type="datetime-local"
                        value={maintenanceForm.scheduledAt}
                        onChange={(event) => handleMaintenanceInputChange('scheduledAt', event.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="maintenanceTitle" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fields.taskTitle')}</label>
                      <input
                        id="maintenanceTitle"
                        value={maintenanceForm.title}
                        onChange={(event) => handleMaintenanceInputChange('title', event.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-800 dark:text-white"
                        placeholder={t('placeholders.taskTitle')}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="maintenanceNotes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fields.taskNotes')}</label>
                    <textarea
                      id="maintenanceNotes"
                      value={maintenanceForm.notes}
                      onChange={(event) => handleMaintenanceInputChange('notes', event.target.value)}
                      rows={3}
                      className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-800 dark:text-white"
                      placeholder={t('placeholders.taskNotes')}
                    />
                  </div>

                  {maintenanceError && (
                    <p className="text-sm text-red-600">{maintenanceError}</p>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isSubmittingMaintenance}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmittingMaintenance ? (
                        <>
                          <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                          {tCommon('saving')}
                        </>
                      ) : (
                        t('saveMaintenanceTask')
                      )}
                    </button>
                  </div>
                </form>

                <div className="mt-6 space-y-4">
                  {maintenanceTasks.length > 0 ? (
                    maintenanceTasks.map((task) => (
                      <div key={task.id} className="border border-gray-100 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-semibold text-gray-900 dark:text-white">{task.title}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{new Date(task.scheduledAt).toLocaleString()}</p>
                        </div>
                        {task.notes && (
                          <p className="text-gray-600 dark:text-gray-300 mb-2">{task.notes}</p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 dark:text-gray-400 italic">{t('noMaintenanceTasks')}</p>
                  )}
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg border border-gray-100 dark:border-gray-600">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{t('ownerContact')}</h3>
                <dl className="space-y-3">
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">{t('fields.ownerWhatsapp')}</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {property.ownerWhatsapp || t('noOwnerWhatsapp')}
                    </dd>
                  </div>
                </dl>
              </div>

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

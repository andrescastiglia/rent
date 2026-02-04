'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { interestedApi } from '@/lib/api/interested';
import { InterestedProfile, CreateInterestedProfileInput } from '@/types/interested';
import { Property } from '@/types/property';
import { PropertyCard } from '@/components/properties/PropertyCard';
import { useAuth } from '@/contexts/auth-context';

const emptyForm: CreateInterestedProfileInput = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  peopleCount: undefined,
  maxAmount: undefined,
  hasPets: false,
  whiteIncome: false,
  guaranteeTypes: [],
  propertyTypePreference: 'apartment',
  operation: 'rent',
  notes: '',
};

export default function InterestedPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations('interested');
  const tc = useTranslations('common');
  const [profiles, setProfiles] = useState<InterestedProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<InterestedProfile | null>(null);
  const [matches, setMatches] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [form, setForm] = useState<CreateInterestedProfileInput>(emptyForm);

  useEffect(() => {
    if (authLoading) return;
    loadProfiles();
  }, [authLoading]);

  const loadProfiles = async () => {
    try {
      const result = await interestedApi.getAll();
      setProfiles(result.data);
    } catch (error) {
      console.error('Failed to load interested profiles', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProfile = async (profile: InterestedProfile) => {
    setSelectedProfile(profile);
    setLoadingMatches(true);
    try {
      const result = await interestedApi.getMatches(profile.id);
      setMatches(result);
    } catch (error) {
      console.error('Failed to load matches', error);
      setMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  };

  const handleFormChange = (field: keyof CreateInterestedProfileInput, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.phone?.trim()) {
      alert(t('errors.phoneRequired'));
      return;
    }

    try {
      const payload: CreateInterestedProfileInput = {
        ...form,
        firstName: form.firstName?.trim() || undefined,
        lastName: form.lastName?.trim() || undefined,
        phone: form.phone.trim(),
        email: form.email?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
        guaranteeTypes: form.guaranteeTypes?.filter((g) => g.trim().length > 0),
      };
      const created = await interestedApi.create(payload);
      setProfiles((prev) => [created, ...prev]);
      setForm(emptyForm);
    } catch (error) {
      console.error('Failed to create interested profile', error);
      alert(tc('error'));
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <form onSubmit={handleCreateProfile} className="space-y-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('newTitle')}</h2>
            <div className="grid grid-cols-1 gap-3">
              <input
                type="text"
                placeholder={t('fields.firstName')}
                value={form.firstName ?? ''}
                onChange={(e) => handleFormChange('firstName', e.target.value)}
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              />
              <input
                type="text"
                placeholder={t('fields.lastName')}
                value={form.lastName ?? ''}
                onChange={(e) => handleFormChange('lastName', e.target.value)}
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              />
              <input
                type="text"
                placeholder={t('fields.phone')}
                value={form.phone ?? ''}
                onChange={(e) => handleFormChange('phone', e.target.value)}
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              />
              <input
                type="email"
                placeholder={t('fields.email')}
                value={form.email ?? ''}
                onChange={(e) => handleFormChange('email', e.target.value)}
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              />
              <input
                type="number"
                min="1"
                placeholder={t('fields.peopleCount')}
                value={form.peopleCount ?? ''}
                onChange={(e) => handleFormChange('peopleCount', e.target.value ? Number(e.target.value) : undefined)}
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={t('fields.maxAmount')}
                value={form.maxAmount ?? ''}
                onChange={(e) => handleFormChange('maxAmount', e.target.value ? Number(e.target.value) : undefined)}
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              />
              <select
                value={form.operation}
                onChange={(e) => handleFormChange('operation', e.target.value)}
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              >
                <option value="rent">{t('operations.rent')}</option>
                <option value="sale">{t('operations.sale')}</option>
              </select>
              <select
                value={form.propertyTypePreference}
                onChange={(e) => handleFormChange('propertyTypePreference', e.target.value)}
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              >
                <option value="apartment">{t('propertyTypes.apartment')}</option>
                <option value="house">{t('propertyTypes.house')}</option>
              </select>
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={form.hasPets ?? false}
                  onChange={(e) => handleFormChange('hasPets', e.target.checked)}
                />
                {t('fields.hasPets')}
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={form.whiteIncome ?? false}
                  onChange={(e) => handleFormChange('whiteIncome', e.target.checked)}
                />
                {t('fields.whiteIncome')}
              </label>
              <input
                type="text"
                placeholder={t('fields.guaranteeTypes')}
                value={(form.guaranteeTypes ?? []).join(', ')}
                onChange={(e) => handleFormChange('guaranteeTypes', e.target.value.split(',').map((v) => v.trim()))}
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              />
              <textarea
                placeholder={t('fields.notes')}
                value={form.notes ?? ''}
                onChange={(e) => handleFormChange('notes', e.target.value)}
                rows={3}
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              {t('actions.save')}
            </button>
          </form>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('listTitle')}</h2>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            ) : profiles.length > 0 ? (
              profiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => handleSelectProfile(profile)}
                  className={`w-full text-left rounded-lg border p-3 transition ${
                    selectedProfile?.id === profile.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                  }`}
                >
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {profile.firstName || profile.lastName
                      ? `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim()
                      : profile.phone}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{profile.phone}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('operationsLabel', { op: t(`operations.${profile.operation ?? 'rent'}`) })}
                  </p>
                </button>
              ))
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('empty')}</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('matchesTitle')}</h2>
            {!selectedProfile ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('matchesHint')}</p>
            ) : loadingMatches ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            ) : matches.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {matches.map((property) => (
                  <PropertyCard key={property.id} property={property} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{t('noMatches')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

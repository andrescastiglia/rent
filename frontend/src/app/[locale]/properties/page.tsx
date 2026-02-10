'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Property } from '@/types/property';
import { propertiesApi } from '@/lib/api/properties';
import { ownersApi } from '@/lib/api/owners';
import { CreateOwnerInput, Owner, UpdateOwnerInput } from '@/types/owner';
import { Plus, Search, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';

type OwnerMode = 'view' | 'edit' | 'create';

const emptyOwnerForm: CreateOwnerInput = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  taxId: '',
};

export default function PropertiesPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations('properties');
  const tc = useTranslations('common');
  const locale = useLocale();

  const [properties, setProperties] = useState<Property[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [ownerMode, setOwnerMode] = useState<OwnerMode>('view');
  const [ownerForm, setOwnerForm] = useState<CreateOwnerInput>(emptyOwnerForm);
  const [savingOwner, setSavingOwner] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    void loadData();
  }, [authLoading]);

  useEffect(() => {
    if (!selectedOwnerId && owners.length > 0) {
      setSelectedOwnerId(owners[0].id);
      setOwnerMode('view');
      setOwnerForm(emptyOwnerForm);
      return;
    }

    if (selectedOwnerId && !owners.some((owner) => owner.id === selectedOwnerId)) {
      setSelectedOwnerId(owners.length > 0 ? owners[0].id : null);
      setOwnerMode('view');
      setOwnerForm(emptyOwnerForm);
    }
  }, [owners, selectedOwnerId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [propertiesResult, ownersResult] = await Promise.all([
        propertiesApi.getAll(),
        ownersApi.getAll(),
      ]);
      setProperties(propertiesResult);
      setOwners(ownersResult);
    } catch (error) {
      console.error('Failed to load owner/property data', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredOwners = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return owners.filter((owner) => {
      if (!term) return true;
      const haystack = `${owner.firstName} ${owner.lastName} ${owner.email ?? ''} ${owner.phone ?? ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [owners, searchTerm]);

  const selectedOwner = useMemo(
    () => owners.find((owner) => owner.id === selectedOwnerId) ?? null,
    [owners, selectedOwnerId],
  );

  const selectedOwnerProperties = useMemo(() => {
    if (!selectedOwner) return [];
    return properties
      .filter((property) => property.ownerId === selectedOwner.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [properties, selectedOwner]);

  const handleSelectOwner = (owner: Owner) => {
    setSelectedOwnerId(owner.id);
    setOwnerMode('view');
    setOwnerForm(emptyOwnerForm);
  };

  const handleCreateOwner = () => {
    setOwnerMode('create');
    setOwnerForm(emptyOwnerForm);
  };

  const handleEditOwner = (owner: Owner) => {
    setSelectedOwnerId(owner.id);
    setOwnerMode('edit');
    setOwnerForm({
      firstName: owner.firstName,
      lastName: owner.lastName,
      email: owner.email,
      phone: owner.phone ?? '',
      taxId: owner.taxId ?? '',
      notes: owner.notes ?? '',
    });
  };

  const handleCancelOwnerForm = () => {
    setOwnerMode('view');
    setOwnerForm(emptyOwnerForm);
  };

  const handleSaveOwner = async () => {
    if (!ownerForm.firstName?.trim() || !ownerForm.lastName?.trim() || !ownerForm.email?.trim()) {
      return;
    }

    setSavingOwner(true);
    try {
      if (ownerMode === 'create') {
        const created = await ownersApi.create({
          ...ownerForm,
          firstName: ownerForm.firstName.trim(),
          lastName: ownerForm.lastName.trim(),
          email: ownerForm.email.trim(),
          phone: ownerForm.phone?.trim() || undefined,
          taxId: ownerForm.taxId?.trim() || undefined,
          notes: ownerForm.notes?.trim() || undefined,
        });
        setOwners((prev) => [created, ...prev]);
        setSelectedOwnerId(created.id);
        setOwnerMode('view');
        setOwnerForm(emptyOwnerForm);
      } else if (ownerMode === 'edit' && selectedOwner) {
        const updated = await ownersApi.update(selectedOwner.id, {
          ...(ownerForm as UpdateOwnerInput),
          firstName: ownerForm.firstName?.trim() || selectedOwner.firstName,
          lastName: ownerForm.lastName?.trim() || selectedOwner.lastName,
          email: ownerForm.email?.trim() || selectedOwner.email,
          phone: ownerForm.phone?.trim() || undefined,
          taxId: ownerForm.taxId?.trim() || undefined,
          notes: ownerForm.notes?.trim() || undefined,
        });
        setOwners((prev) => prev.map((owner) => (owner.id === updated.id ? updated : owner)));
        setOwnerMode('view');
        setOwnerForm(emptyOwnerForm);
      }
    } catch (error) {
      console.error('Failed to save owner', error);
      alert(tc('error'));
    } finally {
      setSavingOwner(false);
    }
  };

  const renderOwnerForm = (title: string) => (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          type="text"
          value={ownerForm.firstName ?? ''}
          onChange={(e) => setOwnerForm((prev) => ({ ...prev, firstName: e.target.value }))}
          placeholder={t('ownerFields.firstName')}
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
        />
        <input
          type="text"
          value={ownerForm.lastName ?? ''}
          onChange={(e) => setOwnerForm((prev) => ({ ...prev, lastName: e.target.value }))}
          placeholder={t('ownerFields.lastName')}
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
        />
        <input
          type="email"
          value={ownerForm.email ?? ''}
          onChange={(e) => setOwnerForm((prev) => ({ ...prev, email: e.target.value }))}
          placeholder={t('ownerFields.email')}
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
        />
        <input
          type="text"
          value={ownerForm.phone ?? ''}
          onChange={(e) => setOwnerForm((prev) => ({ ...prev, phone: e.target.value }))}
          placeholder={t('ownerFields.phone')}
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
        />
        <input
          type="text"
          value={ownerForm.taxId ?? ''}
          onChange={(e) => setOwnerForm((prev) => ({ ...prev, taxId: e.target.value }))}
          placeholder={t('ownerFields.taxId')}
          className="md:col-span-2 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={handleCancelOwnerForm}
          className="px-3 py-2 rounded-md bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 text-sm"
        >
          {tc('cancel')}
        </button>
        <button
          type="button"
          onClick={() => void handleSaveOwner()}
          disabled={savingOwner}
          className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm disabled:opacity-50"
        >
          {savingOwner ? tc('saving') : tc('save')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('ownersTitle')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('ownerListSubtitle')}</p>
        </div>
        <button
          type="button"
          onClick={handleCreateOwner}
          className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus size={18} className="mr-2" />
          {t('addOwner')}
        </button>
      </div>

      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder={t('ownerSearchPlaceholder')}
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-4">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('ownerListTitle')}</h2>
              {filteredOwners.length > 0 ? (
                filteredOwners.map((owner) => (
                  <div
                    key={owner.id}
                    className={`rounded-lg border p-3 ${
                      selectedOwnerId === owner.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectOwner(owner)}
                      className="w-full text-left"
                    >
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {owner.firstName} {owner.lastName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{owner.email}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{owner.phone || '-'}</p>
                    </button>
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleEditOwner(owner)}
                        className="px-2 py-1 text-xs rounded bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                      >
                        {tc('edit')}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  <p>{t('noOwners')}</p>
                  <p className="mt-1">{t('noOwnersDescription')}</p>
                </div>
              )}
            </div>
          </div>

          <div className="xl:col-span-8 space-y-4">
            {ownerMode === 'create' ? renderOwnerForm(t('createOwnerTitle')) : null}

            {selectedOwner ? (
              <>
                {ownerMode === 'edit' ? renderOwnerForm(t('editOwnerTitle')) : (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {selectedOwner.firstName} {selectedOwner.lastName}
                      </h2>
                      <button
                        type="button"
                        onClick={() => handleEditOwner(selectedOwner)}
                        className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
                      >
                        {tc('edit')}
                      </button>
                    </div>
                    <dl className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-gray-500 dark:text-gray-400">{t('ownerFields.email')}</dt>
                        <dd className="text-gray-900 dark:text-white">{selectedOwner.email}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500 dark:text-gray-400">{t('ownerFields.phone')}</dt>
                        <dd className="text-gray-900 dark:text-white">{selectedOwner.phone || '-'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500 dark:text-gray-400">{t('ownerFields.taxId')}</dt>
                        <dd className="text-gray-900 dark:text-white">{selectedOwner.taxId || '-'}</dd>
                      </div>
                    </dl>
                  </div>
                )}

                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('ownerAssignedProperties')}</h3>
                    <Link
                      href={`/${locale}/properties/new?ownerId=${selectedOwner.id}`}
                      className="inline-flex items-center px-3 py-2 rounded-md border border-blue-300 dark:border-blue-700 text-sm text-blue-700 dark:text-blue-300"
                    >
                      <Plus size={16} className="mr-2" />
                      {t('addPropertyForOwner')}
                    </Link>
                  </div>

                  {selectedOwnerProperties.length > 0 ? (
                    <div className="space-y-2">
                      {selectedOwnerProperties.map((property) => (
                        <div key={property.id} className="rounded-md border border-gray-200 dark:border-gray-700 p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{property.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{property.address.street} {property.address.number}, {property.address.city}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/${locale}/properties/${property.id}`}
                              className="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
                            >
                              {tc('view')}
                            </Link>
                            <Link
                              href={`/${locale}/properties/${property.id}/edit`}
                              className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
                            >
                              {tc('edit')}
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('ownerNoProperties')}</p>
                  )}
                </div>
              </>
            ) : (
              ownerMode !== 'create' ? (
                <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-10 text-center text-sm text-gray-500 dark:text-gray-400">
                  {t('noOwnersDescription')}
                </div>
              ) : null
            )}
          </div>
        </div>
      )}
    </div>
  );
}

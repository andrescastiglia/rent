'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Property } from '@/types/property';
import { propertiesApi } from '@/lib/api/properties';
import { ownersApi } from '@/lib/api/owners';
import { Owner } from '@/types/owner';
import { Plus, Search, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';

export default function PropertiesPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations('properties');
  const tc = useTranslations('common');
  const locale = useLocale();

  const [properties, setProperties] = useState<Property[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (authLoading) return;
    void loadData();
  }, [authLoading]);

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

  const filteredData = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const propertiesByOwner = new Map<string, Property[]>();

    for (const property of properties) {
      const current = propertiesByOwner.get(property.ownerId) ?? [];
      current.push(property);
      propertiesByOwner.set(property.ownerId, current);
    }

    const ownerCards = owners
      .map((owner) => ({ owner, properties: propertiesByOwner.get(owner.id) ?? [] }))
      .filter(({ owner, properties: ownerProperties }) => {
        if (!term) return true;

        const ownerName = `${owner.firstName} ${owner.lastName}`.toLowerCase();
        const ownerContact = `${owner.email ?? ''} ${owner.phone ?? ''}`.toLowerCase();
        const hasOwnerMatch = ownerName.includes(term) || ownerContact.includes(term);

        if (hasOwnerMatch) return true;

        return ownerProperties.some((property) => {
          const propertyText = `${property.name} ${property.address.city}`.toLowerCase();
          return propertyText.includes(term);
        });
      });

    const ownerIds = new Set(owners.map((owner) => owner.id));
    const unassignedProperties = properties.filter((property) => !ownerIds.has(property.ownerId));
    const filteredUnassigned = unassignedProperties.filter((property) => {
      if (!term) return true;
      const propertyText = `${property.name} ${property.address.city}`.toLowerCase();
      return propertyText.includes(term);
    });

    return { ownerCards, unassignedProperties: filteredUnassigned };
  }, [owners, properties, searchTerm]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('ownerListSubtitle')}</p>
        </div>
        <Link
          href={`/${locale}/properties/new`}
          className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus size={18} className="mr-2" />
          {t('addProperty')}
        </Link>
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
      ) : filteredData.ownerCards.length > 0 || filteredData.unassignedProperties.length > 0 ? (
        <div className="space-y-4">
          {filteredData.ownerCards.map(({ owner, properties: ownerProperties }) => (
            <div key={owner.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{owner.firstName} {owner.lastName}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{owner.email || '-'}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{owner.phone || '-'}</p>
                </div>
                <Link
                  href={`/${locale}/properties/new?ownerId=${owner.id}`}
                  className="inline-flex items-center px-3 py-2 rounded-md border border-blue-300 dark:border-blue-700 text-sm text-blue-700 dark:text-blue-300"
                >
                  <Plus size={16} className="mr-2" />
                  {t('addPropertyForOwner')}
                </Link>
              </div>

              {ownerProperties.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {ownerProperties.map((property) => (
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
                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{t('ownerNoProperties')}</p>
              )}
            </div>
          ))}

          {filteredData.unassignedProperties.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 dark:bg-amber-900/10 dark:border-amber-800 p-4 space-y-2">
              <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-200">{t('unassignedOwnerTitle')}</h3>
              {filteredData.unassignedProperties.map((property) => (
                <div key={property.id} className="rounded-md border border-amber-200 dark:border-amber-800 p-3 flex items-center justify-between gap-3 bg-white/60 dark:bg-transparent">
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
          ) : null}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">{t('noProperties')}</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('noPropertiesDescription')}</p>
          <div className="mt-6">
            <Link
              href={`/${locale}/properties/new`}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus size={18} className="mr-2" />
              {t('addProperty')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

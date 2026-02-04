'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Property } from '@/types/property';
import { propertiesApi } from '@/lib/api/properties';
import { PropertyCard } from '@/components/properties/PropertyCard';
import { Plus, Search, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';

export default function PropertiesPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations('properties');
  const tc = useTranslations('common');
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [minInvestment, setMinInvestment] = useState('');
  const [maxInvestment, setMaxInvestment] = useState('');

  useEffect(() => {
    if (authLoading) return;
    loadProperties();
  }, [authLoading]);

  const loadProperties = async (filters?: { minSalePrice?: number; maxSalePrice?: number }) => {
    try {
      const data = await propertiesApi.getAll(filters);
      setProperties(data);
    } catch (error) {
      console.error('Failed to load properties', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    const min = minInvestment ? Number(minInvestment) : undefined;
    const max = maxInvestment ? Number(maxInvestment) : undefined;
    setLoading(true);
    loadProperties({
      minSalePrice: Number.isNaN(min ?? NaN) ? undefined : min,
      maxSalePrice: Number.isNaN(max ?? NaN) ? undefined : max,
    });
  };

  const handleClearFilters = () => {
    setMinInvestment('');
    setMaxInvestment('');
    setLoading(true);
    loadProperties();
  };

  const filteredProperties = properties.filter(property =>
    property.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    property.address.city.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('subtitle')}</p>
        </div>
        <Link
          href="/properties/new"
          className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus size={18} className="mr-2" />
          {t('addProperty')}
        </Link>
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

      <div className="mb-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">{t('filters.title')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label htmlFor="minInvestment" className="block text-xs font-medium text-gray-500 dark:text-gray-400">{t('filters.investmentMin')}</label>
            <input
              id="minInvestment"
              type="number"
              min="0"
              step="0.01"
              value={minInvestment}
              onChange={(e) => setMinInvestment(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="maxInvestment" className="block text-xs font-medium text-gray-500 dark:text-gray-400">{t('filters.investmentMax')}</label>
            <input
              id="maxInvestment"
              type="number"
              min="0"
              step="0.01"
              value={maxInvestment}
              onChange={(e) => setMaxInvestment(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleApplyFilters}
              className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              {t('filters.apply')}
            </button>
            <button
              type="button"
              onClick={handleClearFilters}
              className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              {t('filters.clear')}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
        </div>
      ) : filteredProperties.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProperties.map((property) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">{t('noProperties')}</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('noPropertiesDescription')}</p>
          <div className="mt-6">
            <Link
              href="/properties/new"
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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

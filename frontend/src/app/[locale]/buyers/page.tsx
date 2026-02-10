'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { InterestedProfile } from '@/types/interested';
import { interestedApi } from '@/lib/api/interested';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';
import { Loader2, Mail, Phone, Search, UserRound } from 'lucide-react';

export default function BuyersPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations('buyers');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const [buyers, setBuyers] = useState<InterestedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const loadBuyers = useCallback(async (name?: string) => {
    try {
      setLoading(true);
      const result = await interestedApi.getAll({
        status: 'buyer',
        name: name?.trim() || undefined,
        limit: 100,
      });
      setBuyers(result.data);
    } catch (error) {
      console.error('Failed to load buyers', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    void loadBuyers();
  }, [authLoading, loadBuyers]);

  useEffect(() => {
    if (authLoading) return;
    const handle = setTimeout(() => {
      void loadBuyers(searchTerm);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchTerm, authLoading, loadBuyers]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('subtitle')}</p>
        </div>
      </div>

      <div className="relative mb-8">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder={t('searchPlaceholder')}
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
        </div>
      ) : buyers.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {buyers.map((buyer) => (
            <div
              key={buyer.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg border border-gray-100 dark:border-gray-700 p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-300 mr-4">
                    <UserRound size={24} />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {[buyer.firstName, buyer.lastName].filter(Boolean).join(' ') || buyer.phone}
                    </p>
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300">
                      {t('buyerBadge')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                {buyer.email ? (
                  <div className="flex items-center">
                    <Mail size={16} className="mr-2 text-gray-400" />
                    <span className="truncate">{buyer.email}</span>
                  </div>
                ) : null}
                <div className="flex items-center">
                  <Phone size={16} className="mr-2 text-gray-400" />
                  <span>{buyer.phone}</span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end">
                <Link href={`/${locale}/interested`} className="action-link action-link-primary">
                  {tCommon('view')}
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">{t('noBuyers')}</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('noBuyersDescription')}</p>
        </div>
      )}
    </div>
  );
}

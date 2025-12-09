'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Payment, PaymentFilters } from '@/types/payment';
import { paymentsApi } from '@/lib/api/payments';
import { PaymentCard } from '@/components/payments/PaymentCard';
import { Plus, Search, Loader2, Filter } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function PaymentsPage() {
    const t = useTranslations('payments');
    const tCommon = useTranslations('common');

    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');

    const loadPayments = useCallback(async () => {
        try {
            setLoading(true);
            const filters: PaymentFilters = {};
            if (statusFilter) {
                filters.status = statusFilter as any;
            }
            const result = await paymentsApi.getAll(filters);
            setPayments(result.data);
        } catch (error) {
            console.error('Failed to load payments', error);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        loadPayments();
    }, [loadPayments]);

    const filteredPayments = payments.filter((payment) =>
        payment.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.receipt?.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        {t('title')}
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        {t('subtitle')}
                    </p>
                </div>
                <Link
                    href="/payments/new"
                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                    <Plus size={18} className="mr-2" />
                    {t('newPayment')}
                </Link>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 mb-8">
                <div className="relative flex-1">
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
                <div className="relative">
                    <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="block w-full pl-10 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                        <option value="">{t('allStatuses')}</option>
                        <option value="pending">{t('status.pending')}</option>
                        <option value="completed">{t('status.completed')}</option>
                        <option value="cancelled">{t('status.cancelled')}</option>
                    </select>
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
                </div>
            ) : filteredPayments.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredPayments.map((payment) => (
                        <PaymentCard key={payment.id} payment={payment} />
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
                    <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                        {t('noPayments')}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {t('noPaymentsDescription')}
                    </p>
                    <div className="mt-6">
                        <Link
                            href="/payments/new"
                            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            <Plus size={18} className="mr-2" />
                            {t('newPayment')}
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}

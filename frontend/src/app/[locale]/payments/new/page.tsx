'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CreatePaymentInput, PaymentMethod, TenantAccount } from '@/types/payment';
import { Lease } from '@/types/lease';
import { paymentsApi, tenantAccountsApi } from '@/lib/api/payments';
import { leasesApi } from '@/lib/api/leases';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Loader2, Save } from 'lucide-react';

export default function NewPaymentPage() {
    const router = useRouter();
    const t = useTranslations('payments');
    const tCommon = useTranslations('common');

    const [leases, setLeases] = useState<Lease[]>([]);
    const [selectedLeaseId, setSelectedLeaseId] = useState('');
    const [account, setAccount] = useState<TenantAccount | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingLeases, setLoadingLeases] = useState(true);

    const [formData, setFormData] = useState<Partial<CreatePaymentInput>>({
        amount: 0,
        currencyCode: 'ARS',
        paymentDate: new Date().toISOString().split('T')[0],
        method: 'transfer',
        reference: '',
        notes: '',
    });

    useEffect(() => {
        loadLeases();
    }, []);

    useEffect(() => {
        if (selectedLeaseId) {
            loadAccount(selectedLeaseId);
        }
    }, [selectedLeaseId]);

    const loadLeases = async () => {
        try {
            const data = await leasesApi.getAll();
            setLeases(data.filter((l) => l.status === 'ACTIVE'));
        } catch (error) {
            console.error('Failed to load leases', error);
        } finally {
            setLoadingLeases(false);
        }
    };

    const loadAccount = async (leaseId: string) => {
        try {
            const acc = await tenantAccountsApi.getByLease(leaseId);
            setAccount(acc);
            if (acc) {
                setFormData((prev) => ({ ...prev, tenantAccountId: acc.id }));
            }
        } catch (error) {
            console.error('Failed to load account', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!account) return;

        try {
            setLoading(true);
            const payment = await paymentsApi.create({
                tenantAccountId: account.id,
                amount: formData.amount!,
                currencyCode: formData.currencyCode,
                paymentDate: formData.paymentDate!,
                method: formData.method as PaymentMethod,
                reference: formData.reference,
                notes: formData.notes,
            });
            router.push(`/payments/${payment.id}`);
        } catch (error) {
            console.error('Failed to create payment', error);
        } finally {
            setLoading(false);
        }
    };

    const paymentMethods: PaymentMethod[] = ['cash', 'transfer', 'check', 'debit', 'credit', 'other'];

    return (
        <div className="container mx-auto px-4 py-8 max-w-2xl">
            <Link
                href="/payments"
                className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
            >
                <ArrowLeft size={16} className="mr-1" />
                {t('backToPayments')}
            </Link>

            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
                {t('newPayment')}
            </h1>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Lease Selection */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        {t('selectLease')}
                    </h2>

                    {loadingLeases ? (
                        <div className="flex justify-center py-4">
                            <Loader2 className="animate-spin h-6 w-6 text-blue-500" />
                        </div>
                    ) : (
                        <select
                            value={selectedLeaseId}
                            onChange={(e) => setSelectedLeaseId(e.target.value)}
                            required
                            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="">{t('selectLeasePlaceholder')}</option>
                            {leases.map((lease) => (
                                <option key={lease.id} value={lease.id}>
                                    {lease.property?.name || 'Propiedad'} - {lease.tenant?.firstName} {lease.tenant?.lastName}
                                </option>
                            ))}
                        </select>
                    )}

                    {account && (
                        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-md">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {t('currentBalance')}: 
                                <span className={`ml-2 font-bold ${account.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    ${account.balance.toLocaleString('es-AR')}
                                </span>
                            </p>
                        </div>
                    )}
                </div>

                {/* Payment Details */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        {t('paymentDetails')}
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t('amount')} *
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                required
                                value={formData.amount}
                                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t('date')} *
                            </label>
                            <input
                                type="date"
                                required
                                value={formData.paymentDate}
                                onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t('method.label')} *
                            </label>
                            <select
                                required
                                value={formData.method}
                                onChange={(e) => setFormData({ ...formData, method: e.target.value as PaymentMethod })}
                                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                                {paymentMethods.map((method) => (
                                    <option key={method} value={method}>
                                        {t(`method.${method}`)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t('reference')}
                            </label>
                            <input
                                type="text"
                                value={formData.reference}
                                onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                                placeholder={t('referencePlaceholder')}
                                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                    </div>

                    <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t('notes')}
                        </label>
                        <textarea
                            rows={3}
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end space-x-4">
                    <Link
                        href="/payments"
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                        {tCommon('cancel')}
                    </Link>
                    <button
                        type="submit"
                        disabled={loading || !account}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                    >
                        {loading ? (
                            <Loader2 className="animate-spin h-5 w-5 mr-2" />
                        ) : (
                            <Save size={18} className="mr-2" />
                        )}
                        {t('savePayment')}
                    </button>
                </div>
            </form>
        </div>
    );
}

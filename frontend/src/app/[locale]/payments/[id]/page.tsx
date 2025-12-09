'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Payment } from '@/types/payment';
import { paymentsApi } from '@/lib/api/payments';
import { PaymentStatusBadge } from '@/components/payments/PaymentStatusBadge';
import { formatMoneyByCode } from '@/lib/format-money';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Loader2, Calendar, CreditCard, FileText, Download, CheckCircle } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

export default function PaymentDetailPage() {
    const { loading: authLoading } = useAuth();
    const params = useParams();
    const t = useTranslations('payments');
    const tCommon = useTranslations('common');

    const [payment, setPayment] = useState<Payment | null>(null);
    const [loading, setLoading] = useState(true);
    const [confirming, setConfirming] = useState(false);

    const loadPayment = useCallback(async () => {
        try {
            const data = await paymentsApi.getById(params.id as string);
            setPayment(data);
        } catch (error) {
            console.error('Failed to load payment', error);
        } finally {
            setLoading(false);
        }
    }, [params.id]);

    useEffect(() => {
        if (authLoading) return;
        loadPayment();
    }, [loadPayment, authLoading]);

    const handleConfirm = async () => {
        if (!payment) return;
        try {
            setConfirming(true);
            const updated = await paymentsApi.confirm(payment.id);
            setPayment(updated);
        } catch (error) {
            console.error('Failed to confirm payment', error);
        } finally {
            setConfirming(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
            </div>
        );
    }

    if (!payment) {
        return (
            <div className="container mx-auto px-4 py-8">
                <p className="text-gray-500 dark:text-gray-400">{t('notFound')}</p>
                <Link href="/payments" className="text-blue-600 hover:underline">
                    {t('backToPayments')}
                </Link>
            </div>
        );
    }

    const formattedAmount = formatMoneyByCode(payment.amount, payment.currencyCode);
    const formattedDate = new Date(payment.paymentDate).toLocaleDateString('es-AR');

    return (
        <div className="container mx-auto px-4 py-8">
            {/* Header */}
            <div className="mb-8">
                <Link
                    href="/payments"
                    className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
                >
                    <ArrowLeft size={16} className="mr-1" />
                    {t('backToPayments')}
                </Link>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                            {t('paymentDetails')}
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-1">
                            {payment.receipt?.receiptNumber || `#${payment.id.slice(0, 8)}`}
                        </p>
                    </div>
                    <PaymentStatusBadge status={payment.status} />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Payment Info */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        {t('paymentInfo')}
                    </h2>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
                            <span className="text-gray-600 dark:text-gray-400">{t('amount')}</span>
                            <span className="text-2xl font-bold text-gray-900 dark:text-white">
                                {formattedAmount}
                            </span>
                        </div>

                        <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
                            <span className="flex items-center text-gray-600 dark:text-gray-400">
                                <Calendar size={18} className="mr-2" />
                                {t('date')}
                            </span>
                            <span className="text-gray-900 dark:text-white">{formattedDate}</span>
                        </div>

                        <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
                            <span className="flex items-center text-gray-600 dark:text-gray-400">
                                <CreditCard size={18} className="mr-2" />
                                {t('method.label')}
                            </span>
                            <span className="text-gray-900 dark:text-white">
                                {t(`method.${payment.method}`)}
                            </span>
                        </div>

                        {payment.reference && (
                            <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
                                <span className="flex items-center text-gray-600 dark:text-gray-400">
                                    <FileText size={18} className="mr-2" />
                                    {t('reference')}
                                </span>
                                <span className="text-gray-900 dark:text-white">{payment.reference}</span>
                            </div>
                        )}

                        {payment.notes && (
                            <div className="py-3">
                                <span className="text-gray-600 dark:text-gray-400">{t('notes')}</span>
                                <p className="mt-2 text-gray-900 dark:text-white">{payment.notes}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Receipt Info */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        {t('receipt')}
                    </h2>

                    {payment.receipt ? (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
                                <span className="text-gray-600 dark:text-gray-400">{t('receiptNumber')}</span>
                                <span className="text-gray-900 dark:text-white font-mono">
                                    {payment.receipt.receiptNumber}
                                </span>
                            </div>

                            <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
                                <span className="text-gray-600 dark:text-gray-400">{t('issuedAt')}</span>
                                <span className="text-gray-900 dark:text-white">
                                    {new Date(payment.receipt.issuedAt).toLocaleString('es-AR')}
                                </span>
                            </div>

                            {payment.receipt.pdfUrl && (
                                <a
                                    href={payment.receipt.pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center w-full px-4 py-2 mt-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                                >
                                    <Download size={18} className="mr-2" />
                                    {t('downloadReceipt')}
                                </a>
                            )}
                        </div>
                    ) : payment.status === 'pending' ? (
                        <div className="text-center py-8">
                            <p className="text-gray-500 dark:text-gray-400 mb-4">
                                {t('receiptPendingDescription')}
                            </p>
                            <button
                                onClick={handleConfirm}
                                disabled={confirming}
                                className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                            >
                                {confirming ? (
                                    <Loader2 className="animate-spin h-5 w-5 mr-2" />
                                ) : (
                                    <CheckCircle size={18} className="mr-2" />
                                )}
                                {t('confirmPayment')}
                            </button>
                        </div>
                    ) : (
                        <p className="text-gray-500 dark:text-gray-400">
                            {t('noReceipt')}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

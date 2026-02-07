'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Payment, PaymentItemType } from '@/types/payment';
import { paymentsApi } from '@/lib/api/payments';
import { PaymentStatusBadge } from '@/components/payments/PaymentStatusBadge';
import { formatMoneyByCode } from '@/lib/format-money';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Loader2, Calendar, CreditCard, FileText, Download, CheckCircle } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

export default function PaymentDetailPage() {
    const { loading: authLoading } = useAuth();
    const params = useParams();
    const paymentId = Array.isArray(params.id) ? params.id[0] : params.id;
    const t = useTranslations('payments');
    const tCommon = useTranslations('common');

    const [payment, setPayment] = useState<Payment | null>(null);
    const [loading, setLoading] = useState(true);
    const [confirming, setConfirming] = useState(false);
    const [saving, setSaving] = useState(false);
    const [downloadingReceipt, setDownloadingReceipt] = useState(false);
    const [editForm, setEditForm] = useState<{
        paymentDate: string;
        method: string;
        reference: string;
        notes: string;
        items: { description: string; amount: number; quantity: number; type: PaymentItemType }[];
    } | null>(null);

    const loadPayment = useCallback(async () => {
        try {
            if (!paymentId) return;
            const data = await paymentsApi.getById(paymentId);
            setPayment(data);
        } catch (error) {
            console.error('Failed to load payment', error);
        } finally {
            setLoading(false);
        }
    }, [paymentId]);

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

    const handleEditInit = () => {
        if (!payment) return;
        setEditForm({
            paymentDate: payment.paymentDate,
            method: payment.method,
            reference: payment.reference || '',
            notes: payment.notes || '',
            items: (payment.items || []).map((item) => ({
                description: item.description,
                amount: item.amount,
                quantity: item.quantity ?? 1,
                type: item.type ?? 'charge',
            })),
        });
    };

    const handleSaveEdit = async () => {
        if (!payment || !editForm) return;
        try {
            setSaving(true);
            const updated = await paymentsApi.update(payment.id, {
                paymentDate: editForm.paymentDate,
                method: editForm.method as any,
                reference: editForm.reference,
                notes: editForm.notes,
                items: editForm.items,
            });
            setPayment(updated);
            setEditForm(null);
        } catch (error) {
            console.error('Failed to update payment', error);
        } finally {
            setSaving(false);
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
    const hasItems = (payment.items && payment.items.length > 0) || (editForm?.items?.length || 0) > 0;

    const handleDownloadReceipt = async () => {
        if (!payment?.receipt) return;
        try {
            setDownloadingReceipt(true);
            await paymentsApi.downloadReceiptPdf(payment.id, payment.receipt.receiptNumber);
        } catch (error) {
            console.error('Failed to download receipt', error);
        } finally {
            setDownloadingReceipt(false);
        }
    };

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

                        {payment.items && payment.items.length > 0 && (
                            <div className="py-3 border-t border-gray-200 dark:border-gray-700">
                                <span className="text-gray-600 dark:text-gray-400">{t('items.title')}</span>
                                <div className="mt-2 space-y-2 text-sm text-gray-900 dark:text-white">
                                    {payment.items.map((item) => (
                                        <div key={item.id} className="flex justify-between">
                                            <span>{item.description}</span>
                                            <span>
                                                {item.type === 'discount' ? '-' : ''}
                                                {formatMoneyByCode(item.amount * (item.quantity ?? 1), payment.currencyCode)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Editable draft */}
                {payment.status === 'pending' && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                {t('editDraft')}
                            </h2>
                            {!editForm && (
                                <button
                                    onClick={handleEditInit}
                                    className="text-sm text-blue-600 hover:text-blue-500"
                                >
                                    {tCommon('edit')}
                                </button>
                            )}
                        </div>

                        {editForm && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-gray-600 dark:text-gray-400">
                                            {t('date')}
                                        </label>
                                        <input
                                            type="date"
                                            value={editForm.paymentDate}
                                            onChange={(e) =>
                                                setEditForm((prev) =>
                                                    prev ? { ...prev, paymentDate: e.target.value } : prev,
                                                )
                                            }
                                            className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-600 dark:text-gray-400">
                                            {t('method.label')}
                                        </label>
                                        <input
                                            type="text"
                                            value={editForm.method}
                                            onChange={(e) =>
                                                setEditForm((prev) =>
                                                    prev ? { ...prev, method: e.target.value } : prev,
                                                )
                                            }
                                            className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-gray-600 dark:text-gray-400">
                                            {t('reference')}
                                        </label>
                                        <input
                                            type="text"
                                            value={editForm.reference}
                                            onChange={(e) =>
                                                setEditForm((prev) =>
                                                    prev ? { ...prev, reference: e.target.value } : prev,
                                                )
                                            }
                                            className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-600 dark:text-gray-400">
                                            {t('notes')}
                                        </label>
                                        <input
                                            type="text"
                                            value={editForm.notes}
                                            onChange={(e) =>
                                                setEditForm((prev) =>
                                                    prev ? { ...prev, notes: e.target.value } : prev,
                                                )
                                            }
                                            className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                                        {t('items.title')}
                                    </h3>
                                    {editForm.items.length === 0 ? (
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            {t('items.empty')}
                                        </p>
                                    ) : (
                                        <div className="space-y-2">
                                            {editForm.items.map((item, index) => (
                                                <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-2">
                                                    <input
                                                        value={item.description}
                                                        onChange={(e) =>
                                                            setEditForm((prev) => {
                                                                if (!prev) return prev;
                                                                const items = [...prev.items];
                                                                items[index] = { ...items[index], description: e.target.value };
                                                                return { ...prev, items };
                                                            })
                                                        }
                                                        className="md:col-span-2 rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                                                    />
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={item.amount}
                                                        onChange={(e) =>
                                                            setEditForm((prev) => {
                                                                if (!prev) return prev;
                                                                const items = [...prev.items];
                                                                items[index] = { ...items[index], amount: Number(e.target.value) };
                                                                return { ...prev, items };
                                                            })
                                                        }
                                                        className="rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                                                    />
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={item.quantity}
                                                        onChange={(e) =>
                                                            setEditForm((prev) => {
                                                                if (!prev) return prev;
                                                                const items = [...prev.items];
                                                                items[index] = { ...items[index], quantity: Number(e.target.value) };
                                                                return { ...prev, items };
                                                            })
                                                        }
                                                        className="rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                                                    />
                                                    <select
                                                        value={item.type}
                                                        onChange={(e) =>
                                                            setEditForm((prev) => {
                                                                if (!prev) return prev;
                                                                const items = [...prev.items];
                                                                items[index] = { ...items[index], type: e.target.value as PaymentItemType };
                                                                return { ...prev, items };
                                                            })
                                                        }
                                                        className="rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                                                    >
                                                        <option value="charge">{t('items.charge')}</option>
                                                        <option value="discount">{t('items.discount')}</option>
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setEditForm(null)}
                                        className="px-3 py-2 text-sm rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                                    >
                                        {tCommon('cancel')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveEdit}
                                        disabled={saving}
                                        className="px-3 py-2 text-sm rounded-md bg-blue-600 text-white disabled:opacity-50"
                                    >
                                        {saving ? tCommon('saving') : tCommon('save')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

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

                            {payment.receipt && (
                                <button
                                    type="button"
                                    onClick={handleDownloadReceipt}
                                    disabled={downloadingReceipt}
                                    className="inline-flex items-center justify-center w-full px-4 py-2 mt-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-60"
                                >
                                    <Download size={18} className="mr-2" />
                                    {downloadingReceipt ? tCommon('loading') : t('downloadReceipt')}
                                </button>
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

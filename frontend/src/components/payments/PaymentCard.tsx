'use client';

import React from 'react';
import Link from 'next/link';
import { Payment } from '@/types/payment';
import { PaymentStatusBadge } from './PaymentStatusBadge';
import { formatMoneyByCode } from '@/lib/format-money';
import { useTranslations } from 'next-intl';
import { Calendar, CreditCard, FileText } from 'lucide-react';

interface PaymentCardProps {
    payment: Payment;
}

const methodIcons: Record<string, React.ReactNode> = {
    cash: '💵',
    transfer: '🏦',
    check: '📝',
    debit: '💳',
    credit: '💳',
    other: '💰',
};

export function PaymentCard({ payment }: PaymentCardProps) {
    const t = useTranslations('payments');
    const tCommon = useTranslations('common');

    const formattedAmount = formatMoneyByCode(payment.amount, payment.currencyCode);
    const formattedDate = new Date(payment.paymentDate).toLocaleDateString('es-AR');

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="p-5">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center space-x-2">
                        <span className="text-2xl">{methodIcons[payment.method] || '💰'}</span>
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {t(`method.${payment.method}`)}
                            </p>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">
                                {formattedAmount}
                            </p>
                        </div>
                    </div>
                    <PaymentStatusBadge status={payment.status} />
                </div>

                <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center">
                        <Calendar size={16} className="mr-2" />
                        <span>{formattedDate}</span>
                    </div>
                    {payment.reference && (
                        <div className="flex items-center">
                            <FileText size={16} className="mr-2" />
                            <span className="truncate">{payment.reference}</span>
                        </div>
                    )}
                    {payment.receipt && (
                        <div className="flex items-center text-green-600 dark:text-green-400">
                            <CreditCard size={16} className="mr-2" />
                            <span>{payment.receipt.receiptNumber}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="px-5 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
                <Link
                    href={`/payments/${payment.id}`}
                    className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                >
                    {tCommon('view')} →
                </Link>
            </div>
        </div>
    );
}

'use client';

import React from 'react';
import { PaymentStatus } from '@/types/payment';
import { useTranslations } from 'next-intl';

interface PaymentStatusBadgeProps {
    status: PaymentStatus;
}

const statusStyles: Record<PaymentStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    reversed: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
};

export function PaymentStatusBadge({ status }: PaymentStatusBadgeProps) {
    const t = useTranslations('payments');

    return (
        <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[status]}`}
        >
            {t(`status.${status}`)}
        </span>
    );
}

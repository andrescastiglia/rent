'use client';

import React from 'react';
import { InvoiceStatus } from '@/types/payment';
import { useTranslations } from 'next-intl';

interface InvoiceStatusBadgeProps {
    status: InvoiceStatus;
}

const statusStyles: Record<InvoiceStatus, string> = {
    draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    issued: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    partially_paid: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    overdue: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
};

export function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
    const t = useTranslations('invoices');

    return (
        <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[status]}`}
        >
            {t(`status.${status}`)}
        </span>
    );
}

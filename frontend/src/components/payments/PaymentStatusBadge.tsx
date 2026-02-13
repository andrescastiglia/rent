"use client";

import React from "react";
import { PaymentStatus } from "@/types/payment";
import { useTranslations } from "next-intl";

interface PaymentStatusBadgeProps {
  readonly status: PaymentStatus;
}

const statusStyles: Record<PaymentStatus, string> = {
  pending:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  processing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  completed:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  refunded:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

export function PaymentStatusBadge({ status }: PaymentStatusBadgeProps) {
  const t = useTranslations("payments");

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[status]}`}
    >
      {t(`status.${status}`)}
    </span>
  );
}

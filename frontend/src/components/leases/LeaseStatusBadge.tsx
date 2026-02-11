"use client";

import React from "react";
import { LeaseStatus } from "@/types/lease";
import { useTranslations } from "next-intl";

interface LeaseStatusBadgeProps {
  status: LeaseStatus;
}

export function LeaseStatusBadge({ status }: LeaseStatusBadgeProps) {
  const t = useTranslations("leases");

  const styles = {
    ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    DRAFT: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
    FINALIZED: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  };

  const getStatusLabel = (status: LeaseStatus) => {
    const statusKey = status.toLowerCase() as "active" | "draft" | "finalized";
    return t(`status.${statusKey}`);
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide ${styles[status]}`}
    >
      {getStatusLabel(status)}
    </span>
  );
}

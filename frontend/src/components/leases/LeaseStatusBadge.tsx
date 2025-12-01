import React from 'react';
import { LeaseStatus } from '@/types/lease';

interface LeaseStatusBadgeProps {
  status: LeaseStatus;
}

export function LeaseStatusBadge({ status }: LeaseStatusBadgeProps) {
  const styles = {
    ACTIVE: 'bg-green-100 text-green-800',
    DRAFT: 'bg-gray-100 text-gray-800',
    ENDED: 'bg-blue-100 text-blue-800',
    TERMINATED: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide ${styles[status]}`}>
      {status}
    </span>
  );
}

import React from 'react';
import Link from 'next/link';
import { Lease } from '@/types/lease';
import { LeaseStatusBadge } from './LeaseStatusBadge';
import { Calendar, DollarSign, Home, User } from 'lucide-react';

interface LeaseCardProps {
  lease: Lease;
}

export function LeaseCard({ lease }: LeaseCardProps) {
  return (
    <Link href={`/leases/${lease.id}`} className="block group">
      <div className="bg-white rounded-lg shadow-md overflow-hidden transition-transform duration-300 group-hover:-translate-y-1 group-hover:shadow-lg border border-gray-100 p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              {lease.property?.name || 'Unknown Property'}
            </h3>
            <p className="text-sm text-gray-500">
              Unit {lease.unitId}
            </p>
          </div>
          <LeaseStatusBadge status={lease.status} />
        </div>

        <div className="space-y-3">
          <div className="flex items-center text-sm text-gray-600">
            <User size={16} className="mr-2 text-gray-400" />
            <span className="font-medium">
              {lease.tenant ? `${lease.tenant.firstName} ${lease.tenant.lastName}` : 'Unknown Tenant'}
            </span>
          </div>

          <div className="flex items-center text-sm text-gray-600">
            <Calendar size={16} className="mr-2 text-gray-400" />
            <span>
              {new Date(lease.startDate).toLocaleDateString()} - {new Date(lease.endDate).toLocaleDateString()}
            </span>
          </div>

          <div className="flex items-center text-sm text-gray-600">
            <DollarSign size={16} className="mr-2 text-gray-400" />
            <span className="font-semibold text-gray-900">
              ${lease.rentAmount.toLocaleString()}
            </span>
            <span className="text-gray-400 ml-1">/ month</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

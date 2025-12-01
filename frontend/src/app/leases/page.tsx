'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lease } from '@/types/lease';
import { leasesApi } from '@/lib/api/leases';
import { LeaseCard } from '@/components/leases/LeaseCard';
import { Plus, Search, Loader2 } from 'lucide-react';

export default function LeasesPage() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadLeases();
  }, []);

  const loadLeases = async () => {
    try {
      const data = await leasesApi.getAll();
      setLeases(data);
    } catch (error) {
      console.error('Failed to load leases', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLeases = leases.filter(lease =>
    lease.property?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lease.tenant?.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lease.tenant?.lastName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Leases</h1>
          <p className="text-gray-500 mt-1">Manage rental contracts</p>
        </div>
        <Link
          href="/leases/new"
          className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus size={18} className="mr-2" />
          Create Lease
        </Link>
      </div>

      <div className="relative mb-8">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder="Search leases by property or tenant..."
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
        </div>
      ) : filteredLeases.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredLeases.map((lease) => (
            <LeaseCard key={lease.id} lease={lease} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <h3 className="mt-2 text-sm font-medium text-gray-900">No leases found</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating a new lease.</p>
          <div className="mt-6">
            <Link
              href="/leases/new"
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus size={18} className="mr-2" />
              Create Lease
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

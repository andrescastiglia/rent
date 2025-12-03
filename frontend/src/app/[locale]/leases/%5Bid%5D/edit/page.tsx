'use client';

import React, { useEffect, useState } from 'react';
import { LeaseForm } from '@/components/leases/LeaseForm';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { leasesApi } from '@/lib/api/leases';
import { Lease } from '@/types/lease';

export default function EditLeasePage() {
  const params = useParams();
  const [lease, setLease] = useState<Lease | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      loadLease(params.id as string);
    }
  }, [params.id]);

  const loadLease = async (id: string) => {
    try {
      const data = await leasesApi.getById(id);
      setLease(data);
    } catch (error) {
      console.error('Failed to load lease', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (!lease) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Lease not found</h1>
        <Link href="/leases" className="text-blue-600 hover:underline mt-4 inline-block">
          Back to Leases
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href={`/leases/${lease.id}`} className="inline-flex items-center text-gray-500 hover:text-gray-700">
          <ArrowLeft size={16} className="mr-1" />
          Back to Lease Details
        </Link>
      </div>

      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Edit Lease</h1>
        <LeaseForm initialData={lease} isEditing />
      </div>
    </div>
  );
}

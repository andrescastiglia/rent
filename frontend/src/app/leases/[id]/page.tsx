'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Lease } from '@/types/lease';
import { leasesApi } from '@/lib/api/leases';
import { LeaseStatusBadge } from '@/components/leases/LeaseStatusBadge';
import { Edit, ArrowLeft, FileText, Trash2, Loader2, Calendar, DollarSign, User, Home, Download } from 'lucide-react';

export default function LeaseDetailPage() {
  const params = useParams();
  const router = useRouter();
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

  const handleDelete = async () => {
    if (!lease || !confirm('Are you sure you want to delete this lease?')) return;
    
    try {
      await leasesApi.delete(lease.id);
      router.push('/leases');
    } catch (error) {
      console.error('Failed to delete lease', error);
      alert('Failed to delete lease');
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
        <Link href="/leases" className="inline-flex items-center text-gray-500 hover:text-gray-700">
          <ArrowLeft size={16} className="mr-1" />
          Back to Leases
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8 border-b pb-6">
            <div>
               <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold text-gray-900">Lease Agreement</h1>
                  <LeaseStatusBadge status={lease.status} />
               </div>
               <p className="text-gray-500">ID: {lease.id}</p>
            </div>
            <div className="flex space-x-2">
              <Link
                href={`/leases/${lease.id}/edit`}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Edit size={16} className="mr-2" />
                Edit
              </Link>
              <button
                onClick={handleDelete}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                <Trash2 size={16} className="mr-2" />
                Delete
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Property & Tenant</h2>
                <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                  <div className="flex items-start">
                    <Home size={18} className="text-gray-400 mr-3 mt-1" />
                    <div>
                        <p className="font-medium text-gray-900">{lease.property?.name || 'Unknown Property'}</p>
                        <p className="text-sm text-gray-500">Unit: {lease.unitId}</p>
                        {lease.property?.address && (
                            <p className="text-sm text-gray-500">
                                {lease.property.address.street} {lease.property.address.number}, {lease.property.address.city}
                            </p>
                        )}
                    </div>
                  </div>
                  <div className="flex items-start border-t border-gray-200 pt-4">
                    <User size={18} className="text-gray-400 mr-3 mt-1" />
                    <div>
                        <p className="font-medium text-gray-900">
                            {lease.tenant ? `${lease.tenant.firstName} ${lease.tenant.lastName}` : 'Unknown Tenant'}
                        </p>
                        <p className="text-sm text-gray-500">{lease.tenant?.email}</p>
                        <p className="text-sm text-gray-500">{lease.tenant?.phone}</p>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Terms & Conditions</h2>
                <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-gray-700 whitespace-pre-wrap">{lease.terms || 'No specific terms added.'}</p>
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Financial Details</h2>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 flex items-center"><DollarSign size={16} className="mr-2" /> Rent Amount</span>
                    <span className="font-bold text-gray-900 text-lg">${lease.rentAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 flex items-center"><DollarSign size={16} className="mr-2" /> Security Deposit</span>
                    <span className="font-medium text-gray-900">${lease.depositAmount.toLocaleString()}</span>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Duration</h2>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 flex items-center"><Calendar size={16} className="mr-2" /> Start Date</span>
                    <span className="font-medium text-gray-900">{new Date(lease.startDate).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 flex items-center"><Calendar size={16} className="mr-2" /> End Date</span>
                    <span className="font-medium text-gray-900">{new Date(lease.endDate).toLocaleDateString()}</span>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Documents</h2>
                <div className="bg-gray-50 rounded-lg p-4">
                    {lease.documents.length > 0 ? (
                        <ul className="space-y-2">
                            {lease.documents.map((doc, index) => (
                                <li key={index}>
                                    <a href={doc} className="flex items-center text-blue-600 hover:underline">
                                        <FileText size={16} className="mr-2" />
                                        Document {index + 1}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="text-center py-4 text-gray-500">
                            <p className="text-sm italic mb-2">No documents attached.</p>
                            <button className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800" disabled title="Not implemented yet">
                                <Download size={14} className="mr-1" /> Generate PDF Contract
                            </button>
                        </div>
                    )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

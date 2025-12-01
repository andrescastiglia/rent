'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Tenant } from '@/types/tenant';
import { tenantsApi } from '@/lib/api/tenants';
import { Edit, ArrowLeft, User, Mail, Phone, MapPin, Trash2, Loader2, FileText } from 'lucide-react';

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      loadTenant(params.id as string);
    }
  }, [params.id]);

  const loadTenant = async (id: string) => {
    try {
      const data = await tenantsApi.getById(id);
      setTenant(data);
    } catch (error) {
      console.error('Failed to load tenant', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!tenant || !confirm('Are you sure you want to delete this tenant?')) return;
    
    try {
      await tenantsApi.delete(tenant.id);
      router.push('/tenants');
    } catch (error) {
      console.error('Failed to delete tenant', error);
      alert('Failed to delete tenant');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Tenant not found</h1>
        <Link href="/tenants" className="text-blue-600 hover:underline mt-4 inline-block">
          Back to Tenants
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/tenants" className="inline-flex items-center text-gray-500 hover:text-gray-700">
          <ArrowLeft size={16} className="mr-1" />
          Back to Tenants
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8 border-b pb-6">
            <div className="flex items-center">
               <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 mr-6">
                  <User size={40} />
               </div>
               <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-3xl font-bold text-gray-900">{tenant.firstName} {tenant.lastName}</h1>
                    <span className={`px-2 py-1 rounded text-xs font-semibold uppercase tracking-wide ${
                      tenant.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 
                      tenant.status === 'INACTIVE' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {tenant.status}
                    </span>
                  </div>
                  <p className="text-gray-500">ID: {tenant.dni}</p>
               </div>
            </div>
            <div className="flex space-x-2">
              <Link
                href={`/tenants/${tenant.id}/edit`}
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
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center">
                    <Mail size={18} className="text-gray-400 mr-3" />
                    <span className="text-gray-700">{tenant.email}</span>
                  </div>
                  <div className="flex items-center">
                    <Phone size={18} className="text-gray-400 mr-3" />
                    <span className="text-gray-700">{tenant.phone}</span>
                  </div>
                </div>
              </section>

              {tenant.address && (
                <section>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Address</h2>
                  <div className="bg-gray-50 rounded-lg p-4 flex items-start">
                    <MapPin size={18} className="text-gray-400 mr-3 mt-1" />
                    <span className="text-gray-700">
                      {tenant.address.street} {tenant.address.number}<br />
                      {tenant.address.city}, {tenant.address.state} {tenant.address.zipCode}
                    </span>
                  </div>
                </section>
              )}
            </div>

            <div className="space-y-6">
               <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Lease History</h2>
                <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500 italic border-2 border-dashed border-gray-200">
                   <FileText size={32} className="mx-auto mb-2 text-gray-400" />
                   No active leases found.
                   {/* This will be implemented in the Leases module */}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

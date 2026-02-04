'use client';

import React, { useEffect, useState } from 'react';
import { TenantForm } from '@/components/tenants/TenantForm';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { tenantsApi } from '@/lib/api/tenants';
import { Tenant } from '@/types/tenant';
import { useLocale } from 'next-intl';

export default function EditTenantPage() {
  const params = useParams();
  const locale = useLocale();
  const tenantId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tenantId) {
      loadTenant(tenantId);
    }
  }, [tenantId]);

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
        <Link href={`/${locale}/tenants`} className="text-blue-600 hover:underline mt-4 inline-block">
          Back to Tenants
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href={`/tenants/${tenant.id}`} className="inline-flex items-center text-gray-500 hover:text-gray-700">
          <ArrowLeft size={16} className="mr-1" />
          Back to Tenant Details
        </Link>
      </div>

      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Edit Tenant</h1>
        <TenantForm initialData={tenant} isEditing />
      </div>
    </div>
  );
}

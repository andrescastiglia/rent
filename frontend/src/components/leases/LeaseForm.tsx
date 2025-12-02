import React, { useEffect, useState } from 'react';
import { useForm, Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { CreateLeaseInput, Lease } from '@/types/lease';
import { leasesApi } from '@/lib/api/leases';
import { propertiesApi } from '@/lib/api/properties';
import { tenantsApi } from '@/lib/api/tenants';
import { Property } from '@/types/property';
import { Tenant } from '@/types/tenant';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const leaseSchema = z.object({
  propertyId: z.string().min(1, 'Property is required'),
  unitId: z.string().min(1, 'Unit is required'), // Simplified for now, just text input or select if units available
  tenantId: z.string().min(1, 'Tenant is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  rentAmount: z.coerce.number().min(0, 'Rent amount must be positive'),
  depositAmount: z.coerce.number().min(0, 'Deposit amount must be positive'),
  status: z.enum(['DRAFT', 'ACTIVE', 'ENDED', 'TERMINATED'] as const),
  terms: z.string().optional(),
});

type LeaseFormData = z.infer<typeof leaseSchema>;

interface LeaseFormProps {
  initialData?: Lease;
  isEditing?: boolean;
}

export function LeaseForm({ initialData, isEditing = false }: LeaseFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);

  const { register, handleSubmit, formState: { errors } } = useForm<LeaseFormData>({
    resolver: zodResolver(leaseSchema) as Resolver<LeaseFormData>,
    defaultValues: initialData || {
      status: 'DRAFT',
      rentAmount: 0,
      depositAmount: 0,
    },
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const [props, tens] = await Promise.all([
          propertiesApi.getAll(),
          tenantsApi.getAll()
        ]);
        setProperties(props);
        setTenants(tens);
      } catch (error) {
        console.error('Failed to load form data', error);
      }
    };
    loadData();
  }, []);

  const onSubmit = async (data: LeaseFormData) => {
    setIsSubmitting(true);
    try {
      if (isEditing && initialData) {
        await leasesApi.update(initialData.id, data);
        router.push(`/leases/${initialData.id}`);
      } else {
        const newLease = await leasesApi.create(data as CreateLeaseInput);
        router.push(`/leases/${newLease.id}`);
      }
      router.refresh();
    } catch (error) {
      console.error('Error saving lease:', error);
      alert('Failed to save lease');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Lease Details</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="propertyId" className="block text-sm font-medium text-gray-700">Property</label>
            <select
              id="propertyId"
              {...register('propertyId')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            >
              <option value="">Select Property</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {errors.propertyId && <p className="mt-1 text-sm text-red-600">{errors.propertyId.message}</p>}
          </div>

          <div>
            <label htmlFor="unitId" className="block text-sm font-medium text-gray-700">Unit ID</label>
            <input
              id="unitId"
              {...register('unitId')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
              placeholder="e.g. 101"
            />
            {errors.unitId && <p className="mt-1 text-sm text-red-600">{errors.unitId.message}</p>}
          </div>

          <div>
            <label htmlFor="tenantId" className="block text-sm font-medium text-gray-700">Tenant</label>
            <select
              id="tenantId"
              {...register('tenantId')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            >
              <option value="">Select Tenant</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
              ))}
            </select>
            {errors.tenantId && <p className="mt-1 text-sm text-red-600">{errors.tenantId.message}</p>}
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700">Status</label>
            <select
              id="status"
              {...register('status')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            >
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="ENDED">Ended</option>
              <option value="TERMINATED">Terminated</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">Start Date</label>
            <input
              id="startDate"
              type="date"
              {...register('startDate')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            />
            {errors.startDate && <p className="mt-1 text-sm text-red-600">{errors.startDate.message}</p>}
          </div>

          <div>
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">End Date</label>
            <input
              id="endDate"
              type="date"
              {...register('endDate')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            />
            {errors.endDate && <p className="mt-1 text-sm text-red-600">{errors.endDate.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="rentAmount" className="block text-sm font-medium text-gray-700">Rent Amount ($)</label>
            <input
              id="rentAmount"
              type="number"
              {...register('rentAmount')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            />
            {errors.rentAmount && <p className="mt-1 text-sm text-red-600">{errors.rentAmount.message}</p>}
          </div>

          <div>
            <label htmlFor="depositAmount" className="block text-sm font-medium text-gray-700">Deposit Amount ($)</label>
            <input
              id="depositAmount"
              type="number"
              {...register('depositAmount')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            />
            {errors.depositAmount && <p className="mt-1 text-sm text-red-600">{errors.depositAmount.message}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="terms" className="block text-sm font-medium text-gray-700">Terms & Conditions</label>
          <textarea
            id="terms"
            {...register('terms')}
            rows={4}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            placeholder="Lease terms..."
          />
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t">
        <button
          type="button"
          onClick={() => router.back()}
          className="mr-3 px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
              Saving...
            </>
          ) : (
            'Save Lease'
          )}
        </button>
      </div>
    </form>
  );
}

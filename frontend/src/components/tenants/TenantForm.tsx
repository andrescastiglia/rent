import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { CreateTenantInput, Tenant } from '@/types/tenant';
import { tenantsApi } from '@/lib/api/tenants';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const tenantSchema = z.object({
  firstName: z.string().min(2, 'First name is required'),
  lastName: z.string().min(2, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(6, 'Phone number is required'),
  dni: z.string().min(6, 'DNI is required'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PROSPECT'] as const),
  address: z.object({
    street: z.string().optional(),
    number: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
  }).optional(),
});

type TenantFormData = z.infer<typeof tenantSchema>;

interface TenantFormProps {
  initialData?: Tenant;
  isEditing?: boolean;
}

export function TenantForm({ initialData, isEditing = false }: TenantFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<TenantFormData>({
    resolver: zodResolver(tenantSchema),
    defaultValues: initialData || {
      status: 'PROSPECT',
    },
  });

  const onSubmit = async (data: TenantFormData) => {
    setIsSubmitting(true);
    try {
      // Clean up empty address fields
      const cleanData = { ...data };
      if (cleanData.address && (!cleanData.address.street || !cleanData.address.city)) {
          delete cleanData.address;
      }

      if (isEditing && initialData) {
        await tenantsApi.update(initialData.id, cleanData);
        router.push(`/tenants/${initialData.id}`);
      } else {
        await tenantsApi.create(cleanData as CreateTenantInput);
        router.push('/tenants');
      }
      router.refresh();
    } catch (error) {
      console.error('Error saving tenant:', error);
      alert('Failed to save tenant');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Personal Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">First Name</label>
            <input
              {...register('firstName')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            />
            {errors.firstName && <p className="mt-1 text-sm text-red-600">{errors.firstName.message}</p>}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Last Name</label>
            <input
              {...register('lastName')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            />
            {errors.lastName && <p className="mt-1 text-sm text-red-600">{errors.lastName.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              {...register('email')}
              type="email"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            />
            {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Phone</label>
            <input
              {...register('phone')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            />
            {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">DNI / ID</label>
            <input
              {...register('dni')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            />
            {errors.dni && <p className="mt-1 text-sm text-red-600">{errors.dni.message}</p>}
          </div>

          <div>
             <label className="block text-sm font-medium text-gray-700">Status</label>
             <select
               {...register('status')}
               className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
             >
               <option value="PROSPECT">Prospect</option>
               <option value="ACTIVE">Active</option>
               <option value="INACTIVE">Inactive</option>
             </select>
           </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Address (Optional)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Street</label>
            <input {...register('address.street')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-medium text-gray-700">Number</label>
                <input {...register('address.number')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">City</label>
            <input {...register('address.city')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">State</label>
            <input {...register('address.state')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Zip Code</label>
            <input {...register('address.zipCode')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
          </div>
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
            'Save Tenant'
          )}
        </button>
      </div>
    </form>
  );
}

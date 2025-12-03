'use client';

import React, { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateTenantInput, Tenant } from '@/types/tenant';
import { tenantsApi } from '@/lib/api/tenants';
import { useLocalizedRouter } from '@/hooks/useLocalizedRouter';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createTenantSchema, TenantFormData } from '@/lib/validation-schemas';
import * as z from 'zod';

// Extender el schema base para incluir status y address opcional
const createExtendedTenantSchema = (t: (key: string, params?: Record<string, string | number>) => string) => {
  const baseSchema = createTenantSchema(t);
  return baseSchema.extend({
    status: z.enum(['ACTIVE', 'INACTIVE', 'PROSPECT'] as const),
    address: z.object({
      street: z.string().optional(),
      number: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
    }).optional(),
  });
};

type ExtendedTenantFormData = z.infer<ReturnType<typeof createExtendedTenantSchema>>;

interface TenantFormProps {
  initialData?: Tenant;
  isEditing?: boolean;
}

export function TenantForm({ initialData, isEditing = false }: TenantFormProps) {
  const router = useLocalizedRouter();
  const t = useTranslations('tenants');
  const tCommon = useTranslations('common');
  const tValidation = useTranslations('validation');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Crear schema con mensajes traducidos
  const tenantSchema = useMemo(() => createExtendedTenantSchema(tValidation), [tValidation]);

  const { register, handleSubmit, formState: { errors } } = useForm<ExtendedTenantFormData>({
    resolver: zodResolver(tenantSchema),
    defaultValues: initialData || {
      status: 'PROSPECT',
    },
  });

  const onSubmit = async (data: ExtendedTenantFormData) => {
    setIsSubmitting(true);
    try {
      // Clean up empty address fields
      const cleanData = { ...data };
      if (cleanData.address && (!cleanData.address.street || !cleanData.address.city)) {
          delete cleanData.address;
      }

      if (isEditing && initialData) {
        await tenantsApi.update(initialData.id, cleanData as any);
        router.push(`/tenants/${initialData.id}`);
      } else {
        await tenantsApi.create(cleanData as CreateTenantInput);
        router.push('/tenants');
      }
      router.refresh();
    } catch (error) {
      console.error('Error saving tenant:', error);
      alert(tCommon('error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">{t('personalInfo')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fields.firstName')}</label>
            <input
              {...register('firstName')}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
            />
            {errors.firstName && <p className="mt-1 text-sm text-red-600">{errors.firstName.message}</p>}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fields.lastName')}</label>
            <input
              {...register('lastName')}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
            />
            {errors.lastName && <p className="mt-1 text-sm text-red-600">{errors.lastName.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fields.email')}</label>
            <input
              {...register('email')}
              type="email"
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
            />
            {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fields.phone')}</label>
            <input
              {...register('phone')}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
            />
            {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fields.dni')}</label>
            <input
              {...register('dni')}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
            />
            {errors.dni && <p className="mt-1 text-sm text-red-600">{errors.dni.message}</p>}
          </div>

          <div>
             <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fields.status')}</label>
             <select
               {...register('status')}
               className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
             >
               <option value="PROSPECT">{t('status.PROSPECT')}</option>
               <option value="ACTIVE">{t('status.ACTIVE')}</option>
               <option value="INACTIVE">{t('status.INACTIVE')}</option>
             </select>
           </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">{t('addressOptional')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fields.street')}</label>
            <input {...register('address.street')} className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fields.number')}</label>
                <input {...register('address.number')} className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fields.city')}</label>
            <input {...register('address.city')} className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fields.state')}</label>
            <input {...register('address.state')} className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fields.zipCode')}</label>
            <input {...register('address.zipCode')} className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white" />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t dark:border-gray-700">
        <button
          type="button"
          onClick={() => router.back()}
          className="mr-3 px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          {tCommon('cancel')}
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
              {tCommon('saving')}
            </>
          ) : (
            t('saveTenant')
          )}
        </button>
      </div>
    </form>
  );
}

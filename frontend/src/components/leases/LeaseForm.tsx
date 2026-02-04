'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useForm, Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateLeaseInput, Lease } from '@/types/lease';
import { Owner } from '@/types/owner';
import { leasesApi } from '@/lib/api/leases';
import { propertiesApi } from '@/lib/api/properties';
import { tenantsApi } from '@/lib/api/tenants';
import { ownersApi } from '@/lib/api/owners';
import { Property } from '@/types/property';
import { Tenant } from '@/types/tenant';
import { useLocalizedRouter } from '@/hooks/useLocalizedRouter';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createLeaseSchema, LeaseFormData } from '@/lib/validation-schemas';
import { CurrencySelect } from '@/components/common/CurrencySelect';

interface LeaseFormProps {
  initialData?: Lease;
  isEditing?: boolean;
}

export function LeaseForm({ initialData, isEditing = false }: LeaseFormProps) {
  const router = useLocalizedRouter();
  const t = useTranslations('leases');
  const tCommon = useTranslations('common');
  const tValidation = useTranslations('validation');
  const tCurrencies = useTranslations('currencies');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);

  // Crear schema con mensajes traducidos
  const leaseSchema = useMemo(() => createLeaseSchema(tValidation), [tValidation]);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<LeaseFormData>({
    resolver: zodResolver(leaseSchema) as Resolver<LeaseFormData>,
    defaultValues: initialData || {
      status: 'DRAFT',
      rentAmount: 0,
      depositAmount: 0,
      currency: 'ARS',
      paymentFrequency: 'monthly',
      billingFrequency: 'first_of_month',
      lateFeeType: 'none',
      adjustmentType: 'fixed',
      autoGenerateInvoices: true,
    },
  });

  const lateFeeType = watch('lateFeeType');
  const adjustmentType = watch('adjustmentType');

  useEffect(() => {
    const loadData = async () => {
      try {
        const [props, tens, owns] = await Promise.all([
          propertiesApi.getAll(),
          tenantsApi.getAll(),
          ownersApi.getAll()
        ]);
        setProperties(props);
        setTenants(tens);
        setOwners(owns);
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
      alert(tCommon('error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = "mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white";
  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";
  const sectionClass = "space-y-4";
  const sectionTitleClass = "text-lg font-medium text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
      {/* Basic Lease Details */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>{t('leaseDetails')}</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="propertyId" className={labelClass}>{t('fields.property')}</label>
            <select id="propertyId" {...register('propertyId')} className={inputClass}>
              <option value="">{t('selectProperty')}</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {errors.propertyId && <p className="mt-1 text-sm text-red-600">{errors.propertyId.message}</p>}
          </div>

          <div>
            <label htmlFor="unitId" className={labelClass}>{t('fields.unitId')}</label>
            <input id="unitId" {...register('unitId')} className={inputClass} placeholder={t('unitIdPlaceholder')} />
            {errors.unitId && <p className="mt-1 text-sm text-red-600">{errors.unitId.message}</p>}
          </div>

          <div>
            <label htmlFor="tenantId" className={labelClass}>{t('fields.tenant')}</label>
            <select id="tenantId" {...register('tenantId')} className={inputClass}>
              <option value="">{t('selectTenant')}</option>
              {tenants.map(tenant => (
                <option key={tenant.id} value={tenant.id}>{tenant.firstName} {tenant.lastName}</option>
              ))}
            </select>
            {errors.tenantId && <p className="mt-1 text-sm text-red-600">{errors.tenantId.message}</p>}
          </div>

          <div>
            <label htmlFor="ownerId" className={labelClass}>{t('fields.owner')}</label>
            <select id="ownerId" {...register('ownerId')} className={inputClass}>
              <option value="">{t('selectOwner')}</option>
              {owners.map(owner => (
                <option key={owner.id} value={owner.id}>{owner.firstName} {owner.lastName}</option>
              ))}
            </select>
            {errors.ownerId && <p className="mt-1 text-sm text-red-600">{errors.ownerId.message}</p>}
          </div>

          <div>
            <label htmlFor="status" className={labelClass}>{t('fields.status')}</label>
            <select id="status" {...register('status')} className={inputClass}>
              <option value="DRAFT">{t('status.DRAFT')}</option>
              <option value="ACTIVE">{t('status.ACTIVE')}</option>
              <option value="ENDED">{t('status.ENDED')}</option>
              <option value="TERMINATED">{t('status.TERMINATED')}</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="startDate" className={labelClass}>{t('fields.startDate')}</label>
            <input id="startDate" type="date" {...register('startDate')} className={inputClass} />
            {errors.startDate && <p className="mt-1 text-sm text-red-600">{errors.startDate.message}</p>}
          </div>

          <div>
            <label htmlFor="endDate" className={labelClass}>{t('fields.endDate')}</label>
            <input id="endDate" type="date" {...register('endDate')} className={inputClass} />
            {errors.endDate && <p className="mt-1 text-sm text-red-600">{errors.endDate.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="rentAmount" className={labelClass}>{t('fields.rentAmount')}</label>
            <input id="rentAmount" type="number" {...register('rentAmount')} className={inputClass} />
            {errors.rentAmount && <p className="mt-1 text-sm text-red-600">{errors.rentAmount.message}</p>}
          </div>

          <div>
            <label htmlFor="depositAmount" className={labelClass}>{t('fields.depositAmount')}</label>
            <input id="depositAmount" type="number" {...register('depositAmount')} className={inputClass} />
            {errors.depositAmount && <p className="mt-1 text-sm text-red-600">{errors.depositAmount.message}</p>}
          </div>

          <div>
            <label htmlFor="currency" className={labelClass}>{tCurrencies('title')}</label>
            <CurrencySelect value={watch('currency') || 'ARS'} onChange={(value) => setValue('currency', value)} />
            {errors.currency && <p className="mt-1 text-sm text-red-600">{errors.currency.message}</p>}
          </div>
        </div>
      </div>

      {/* Billing Configuration */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>{t('billing.title')}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('billing.description')}</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="paymentFrequency" className={labelClass}>{t('fields.paymentFrequency')}</label>
            <select id="paymentFrequency" {...register('paymentFrequency')} className={inputClass}>
              <option value="monthly">{t('paymentFrequencies.monthly')}</option>
              <option value="bimonthly">{t('paymentFrequencies.bimonthly')}</option>
              <option value="quarterly">{t('paymentFrequencies.quarterly')}</option>
              <option value="semiannual">{t('paymentFrequencies.semiannual')}</option>
              <option value="annual">{t('paymentFrequencies.annual')}</option>
            </select>
          </div>

          <div>
            <label htmlFor="billingFrequency" className={labelClass}>{t('fields.billingFrequency')}</label>
            <select id="billingFrequency" {...register('billingFrequency')} className={inputClass}>
              <option value="first_of_month">{t('billingFrequencies.first_of_month')}</option>
              <option value="last_of_month">{t('billingFrequencies.last_of_month')}</option>
              <option value="contract_date">{t('billingFrequencies.contract_date')}</option>
              <option value="custom">{t('billingFrequencies.custom')}</option>
            </select>
          </div>

          <div>
            <label htmlFor="billingDay" className={labelClass}>{t('fields.billingDay')}</label>
            <input id="billingDay" type="number" min="1" max="28" {...register('billingDay')} className={inputClass} />
          </div>

          <div>
            <label htmlFor="paymentDueDay" className={labelClass}>{t('fields.paymentDueDay')}</label>
            <input id="paymentDueDay" type="number" min="1" max="28" {...register('paymentDueDay')} className={inputClass} />
          </div>

          <div className="flex items-center pt-6">
            <input id="autoGenerateInvoices" type="checkbox" {...register('autoGenerateInvoices')} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
            <label htmlFor="autoGenerateInvoices" className="ml-2 text-sm text-gray-700 dark:text-gray-300">{t('fields.autoGenerateInvoices')}</label>
          </div>
        </div>
      </div>

      {/* Late Fee Configuration */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>{t('lateFees.title')}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('lateFees.description')}</p>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="lateFeeType" className={labelClass}>{t('fields.lateFeeType')}</label>
            <select id="lateFeeType" {...register('lateFeeType')} className={inputClass}>
              <option value="none">{t('lateFeeTypes.none')}</option>
              <option value="fixed">{t('lateFeeTypes.fixed')}</option>
              <option value="percentage">{t('lateFeeTypes.percentage')}</option>
              <option value="daily_fixed">{t('lateFeeTypes.daily_fixed')}</option>
              <option value="daily_percentage">{t('lateFeeTypes.daily_percentage')}</option>
            </select>
          </div>

          {lateFeeType && lateFeeType !== 'none' && (
            <>
              <div>
                <label htmlFor="lateFeeValue" className={labelClass}>{t('fields.lateFeeValue')}</label>
                <input id="lateFeeValue" type="number" step="0.01" {...register('lateFeeValue')} className={inputClass} />
              </div>

              <div>
                <label htmlFor="lateFeeGraceDays" className={labelClass}>{t('fields.lateFeeGraceDays')}</label>
                <input id="lateFeeGraceDays" type="number" min="0" {...register('lateFeeGraceDays')} className={inputClass} />
              </div>

              <div>
                <label htmlFor="lateFeeMax" className={labelClass}>{t('fields.lateFeeMax')}</label>
                <input id="lateFeeMax" type="number" step="0.01" {...register('lateFeeMax')} className={inputClass} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Adjustment Configuration */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>{t('adjustments.title')}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('adjustments.description')}</p>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="adjustmentType" className={labelClass}>{t('fields.adjustmentType')}</label>
            <select id="adjustmentType" {...register('adjustmentType')} className={inputClass}>
              <option value="fixed">{t('adjustmentTypes.fixed')}</option>
              <option value="percentage">{t('adjustmentTypes.percentage')}</option>
              <option value="inflation_index">{t('adjustmentTypes.inflation_index')}</option>
            </select>
          </div>

          {adjustmentType && adjustmentType !== 'fixed' && (
            <>
              {adjustmentType === 'percentage' && (
                <div>
                  <label htmlFor="adjustmentValue" className={labelClass}>{t('fields.adjustmentValue')} (%)</label>
                  <input id="adjustmentValue" type="number" step="0.01" {...register('adjustmentValue')} className={inputClass} />
                </div>
              )}

              {adjustmentType === 'inflation_index' && (
                <div>
                  <label htmlFor="inflationIndexType" className={labelClass}>{t('fields.inflationIndexType')}</label>
                  <select id="inflationIndexType" {...register('inflationIndexType')} className={inputClass}>
                    <option value="icl">{t('inflationIndexTypes.icl')}</option>
                    <option value="ipc">{t('inflationIndexTypes.ipc')}</option>
                    <option value="igp_m">{t('inflationIndexTypes.igp_m')}</option>
                    <option value="casa_propia">{t('inflationIndexTypes.casa_propia')}</option>
                    <option value="custom">{t('inflationIndexTypes.custom')}</option>
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="adjustmentFrequencyMonths" className={labelClass}>{t('fields.adjustmentFrequencyMonths')}</label>
                <input id="adjustmentFrequencyMonths" type="number" min="1" {...register('adjustmentFrequencyMonths')} className={inputClass} />
              </div>

              <div>
                <label htmlFor="nextAdjustmentDate" className={labelClass}>{t('fields.nextAdjustmentDate')}</label>
                <input id="nextAdjustmentDate" type="date" {...register('nextAdjustmentDate')} className={inputClass} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Terms and Conditions */}
      <div className={sectionClass}>
        <div>
          <label htmlFor="terms" className={labelClass}>{t('termsAndConditions')}</label>
          <textarea id="terms" {...register('terms')} rows={4} className={inputClass} placeholder={t('leaseTermsPlaceholder')} />
        </div>
      </div>

      {/* Form Actions */}
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
            t('saveLease')
          )}
        </button>
      </div>
    </form>
  );
}

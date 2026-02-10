'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useForm, Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateLeaseInput, Lease, LeaseTemplate } from '@/types/lease';
import { Owner } from '@/types/owner';
import { leasesApi } from '@/lib/api/leases';
import { propertiesApi } from '@/lib/api/properties';
import { ownersApi } from '@/lib/api/owners';
import { interestedApi } from '@/lib/api/interested';
import { Property } from '@/types/property';
import { useLocalizedRouter } from '@/hooks/useLocalizedRouter';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createLeaseSchema, LeaseFormData } from '@/lib/validation-schemas';
import { CurrencySelect } from '@/components/common/CurrencySelect';
import { useSearchParams } from 'next/navigation';

interface LeaseFormProps {
  initialData?: Lease;
  isEditing?: boolean;
}

interface LeaseTenantOption {
  id: string;
  label: string;
}

interface LeaseBuyerOption {
  id: string;
  label: string;
}

export function LeaseForm({ initialData, isEditing = false }: LeaseFormProps) {
  const router = useLocalizedRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('leases');
  const tCommon = useTranslations('common');
  const tValidation = useTranslations('validation');
  const tCurrencies = useTranslations('currencies');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenantOptions, setTenantOptions] = useState<LeaseTenantOption[]>([]);
  const [buyerOptions, setBuyerOptions] = useState<LeaseBuyerOption[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [templates, setTemplates] = useState<LeaseTemplate[]>([]);

  // Crear schema con mensajes traducidos
  const leaseSchema = useMemo(() => createLeaseSchema(tValidation), [tValidation]);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<LeaseFormData>({
    resolver: zodResolver(leaseSchema) as Resolver<LeaseFormData>,
    defaultValues: initialData || {
      contractType: 'rental',
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
  const contractType = watch('contractType');
  const selectedPropertyId = watch('propertyId');
  const preselectedPropertyId = searchParams.get('propertyId');
  const preselectedOwnerId = searchParams.get('ownerId');
  const preselectedTenantId = searchParams.get('tenantId');
  const preselectedBuyerProfileId = searchParams.get('buyerProfileId');
  const preselectedContractType = searchParams.get('contractType');
  const hasPreselectedProperty = !isEditing && !!preselectedPropertyId;
  const hasPreselectedOwner = !isEditing && !!preselectedOwnerId;
  const hasPreselectedTenant = !isEditing && !!preselectedTenantId;
  const hasPreselectedBuyer = !isEditing && !!preselectedBuyerProfileId;
  const selectedProperty = useMemo(
    () => properties.find((property) => property.id === selectedPropertyId),
    [properties, selectedPropertyId],
  );
  const selectedPropertyOperations = selectedProperty?.operations ?? [];
  const selectedPropertySupportsRent = selectedPropertyOperations.includes('rent');
  const selectedPropertySupportsSale = selectedPropertyOperations.includes('sale');
  const shouldShowContractTypeSelect =
    isEditing ||
    !selectedProperty ||
    selectedPropertySupportsRent === selectedPropertySupportsSale;

  useEffect(() => {
    const loadData = async () => {
      try {
        const [props, interestedResponse, owns, leaseTemplates] = await Promise.all([
          propertiesApi.getAll(),
          interestedApi.getAll({ limit: 200 }),
          ownersApi.getAll(),
          leasesApi.getTemplates(),
        ]);
        const options = interestedResponse.data
          .filter((profile) =>
            !!profile.convertedToTenantId &&
            profile.status === 'tenant' &&
            (profile.operations ?? []).some((operation) => operation === 'rent'),
          )
          .map((profile) => ({
            id: profile.convertedToTenantId as string,
            label: `${profile.firstName} ${profile.lastName}`.trim(),
          }))
          .filter((option, index, all) => all.findIndex((item) => item.id === option.id) === index);

        const saleProfiles = interestedResponse.data
          .filter(
            (profile) =>
              profile.status === 'buyer' &&
              (profile.operations ?? []).some((operation) => operation === 'sale'),
          )
          .map((profile) => ({
            id: profile.id,
            label: `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() || profile.phone,
          }));

        setProperties(props);
        setTenantOptions(options);
        setBuyerOptions(saleProfiles);
        setOwners(owns);
        setTemplates(leaseTemplates);
      } catch (error) {
        console.error('Failed to load form data', error);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (isEditing) {
      return;
    }
    if (preselectedPropertyId) {
      setValue('propertyId', preselectedPropertyId);
    }
    if (preselectedOwnerId) {
      setValue('ownerId', preselectedOwnerId);
    }
    if (preselectedContractType === 'rental' || preselectedContractType === 'sale') {
      setValue('contractType', preselectedContractType);
    }
    if (preselectedTenantId) {
      setValue('tenantId', preselectedTenantId);
      setValue('contractType', 'rental');
    }
    if (preselectedBuyerProfileId) {
      setValue('buyerProfileId', preselectedBuyerProfileId);
      setValue('contractType', 'sale');
    }
  }, [
    isEditing,
    preselectedPropertyId,
    preselectedOwnerId,
    preselectedTenantId,
    preselectedBuyerProfileId,
    preselectedContractType,
    setValue,
  ]);

  useEffect(() => {
    if (isEditing || !selectedProperty) return;

    if (selectedPropertySupportsRent && !selectedPropertySupportsSale) {
      if (contractType !== 'rental') {
        setValue('contractType', 'rental', { shouldValidate: true });
      }
      setValue('buyerProfileId', undefined, { shouldValidate: true });
      return;
    }

    if (!selectedPropertySupportsRent && selectedPropertySupportsSale) {
      if (contractType !== 'sale') {
        setValue('contractType', 'sale', { shouldValidate: true });
      }
      setValue('tenantId', undefined, { shouldValidate: true });
    }
  }, [
    contractType,
    isEditing,
    selectedProperty,
    selectedPropertySupportsRent,
    selectedPropertySupportsSale,
    setValue,
  ]);

  const onSubmit = async (data: LeaseFormData) => {
    setIsSubmitting(true);
    try {
      if (isEditing && initialData) {
        const updated = await leasesApi.update(initialData.id, data);
        router.push(`/leases/${updated.id}`);
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
  const templatesForType = templates.filter((item) => item.contractType === contractType);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
      {/* Basic Lease Details */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>{t('leaseDetails')}</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {hasPreselectedProperty ? (
            <input type="hidden" {...register('propertyId')} />
          ) : (
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
          )}

          <div>
            <label htmlFor="contractType" className={labelClass}>{t('fields.contractType')}</label>
            {shouldShowContractTypeSelect ? (
              <select id="contractType" {...register('contractType')} className={inputClass}>
                <option value="rental">{t('contractTypes.rental')}</option>
                <option value="sale">{t('contractTypes.sale')}</option>
              </select>
            ) : (
              <>
                <input type="hidden" {...register('contractType')} />
                <p className={inputClass}>{t(`contractTypes.${contractType}`)}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('contractTypeFixedByProperty')}
                </p>
              </>
            )}
            {errors.contractType && <p className="mt-1 text-sm text-red-600">{errors.contractType.message}</p>}
          </div>

          <div>
            <label htmlFor="templateId" className={labelClass}>{t('fields.template')}</label>
            <select id="templateId" {...register('templateId')} className={inputClass}>
              <option value="">{t('templates.select')}</option>
              {templatesForType.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </div>

          {hasPreselectedOwner ? (
            <input type="hidden" {...register('ownerId')} />
          ) : (
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
          )}

          <div>
            <label htmlFor="status" className={labelClass}>{t('fields.status')}</label>
            <select id="status" {...register('status')} className={inputClass}>
              <option value="DRAFT">{t('status.DRAFT')}</option>
              <option value="ACTIVE">{t('status.ACTIVE')}</option>
              <option value="FINALIZED">{t('status.FINALIZED')}</option>
            </select>
          </div>
        </div>

        {contractType === 'rental' && (
          hasPreselectedTenant ? (
            <input type="hidden" {...register('tenantId')} />
          ) : (
            <div>
              <label htmlFor="tenantId" className={labelClass}>{t('fields.tenant')}</label>
              <select id="tenantId" {...register('tenantId')} className={inputClass}>
                <option value="">{t('selectTenant')}</option>
                {tenantOptions.map(tenant => (
                  <option key={tenant.id} value={tenant.id}>{tenant.label}</option>
                ))}
              </select>
              {errors.tenantId && <p className="mt-1 text-sm text-red-600">{errors.tenantId.message}</p>}
            </div>
          )
        )}

        {contractType === 'rental' ? (
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hasPreselectedBuyer ? (
              <input type="hidden" {...register('buyerProfileId')} />
            ) : (
              <div>
                <label htmlFor="buyerProfileId" className={labelClass}>{t('fields.buyer')}</label>
                <select id="buyerProfileId" {...register('buyerProfileId')} className={inputClass}>
                  <option value="">{t('selectBuyer')}</option>
                  {buyerOptions.map((buyer) => (
                    <option key={buyer.id} value={buyer.id}>{buyer.label}</option>
                  ))}
                </select>
                {errors.buyerProfileId && <p className="mt-1 text-sm text-red-600">{errors.buyerProfileId.message}</p>}
              </div>
            )}
            <div>
              <label htmlFor="fiscalValue" className={labelClass}>{t('fields.fiscalValue')}</label>
              <input id="fiscalValue" type="number" {...register('fiscalValue')} className={inputClass} />
              {errors.fiscalValue && <p className="mt-1 text-sm text-red-600">{errors.fiscalValue.message}</p>}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {contractType === 'rental' && (
            <div>
              <label htmlFor="rentAmount" className={labelClass}>{t('fields.rentAmount')}</label>
              <input id="rentAmount" type="number" {...register('rentAmount')} className={inputClass} />
              {errors.rentAmount && <p className="mt-1 text-sm text-red-600">{errors.rentAmount.message}</p>}
            </div>
          )}

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
      {contractType === 'rental' && (
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
      )}

      {/* Late Fee Configuration */}
      {contractType === 'rental' && (
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
      )}

      {/* Adjustment Configuration */}
      {contractType === 'rental' && (
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
      )}

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

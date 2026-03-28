import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, useEffect } from 'react';
import {
  Controller,
  useForm,
  type Control,
  type FieldErrors,
  type UseFormSetValue,
} from 'react-hook-form';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { buyersApi } from '@/api/buyers';
import { currenciesApi } from '@/api/currencies';
import { interestedApi } from '@/api/interested';
import { leasesApi } from '@/api/leases';
import { ownersApi } from '@/api/owners';
import { propertiesApi } from '@/api/properties';
import { AppButton, Field } from '@/components/ui';
import { i18n } from '@/i18n';
import type {
  ContractType,
  CreateLeaseInput,
  Lease,
  LeaseRenewalAlertPeriodicity,
  LeaseTemplate,
  UpdateLeaseInput,
} from '@/types/lease';
import type { InterestedProfile } from '@/types/interested';
import type { Owner } from '@/types/owner';
import type { Property } from '@/types/property';

const isBlank = (value?: string | null): boolean =>
  value === undefined || value === null || value.trim().length === 0;

const addLeaseIssue = (
  ctx: z.RefinementCtx,
  path: keyof FormValues,
  message: string,
): void => {
  ctx.addIssue({
    code: 'custom',
    path: [path],
    message,
  });
};

const validateRentalValues = (
  values: FormValues,
  ctx: z.RefinementCtx,
): void => {
  if (isBlank(values.tenantId)) {
    addLeaseIssue(ctx, 'tenantId', 'lease.tenant.required');
  }
  if (isBlank(values.startDate)) {
    addLeaseIssue(ctx, 'startDate', 'lease.startDate.required');
  }
  if (isBlank(values.endDate)) {
    addLeaseIssue(ctx, 'endDate', 'lease.endDate.required');
  }
  if (isBlank(values.rentAmount)) {
    addLeaseIssue(ctx, 'rentAmount', 'lease.rentAmount.required');
  }
  if (
    values.renewalAlertEnabled === 'yes' &&
    values.renewalAlertPeriodicity === 'custom' &&
    isBlank(values.renewalAlertCustomDays)
  ) {
    addLeaseIssue(
      ctx,
      'renewalAlertCustomDays',
      'lease.renewalAlertCustomDays.required',
    );
  }
};

const validateSaleValues = (values: FormValues, ctx: z.RefinementCtx): void => {
  if (isBlank(values.buyerId)) {
    addLeaseIssue(ctx, 'buyerId', 'lease.buyer.required');
  }
  if (isBlank(values.fiscalValue)) {
    addLeaseIssue(ctx, 'fiscalValue', 'lease.fiscalValue.required');
  }
};

const schema = z
  .object({
    propertyId: z.string().min(1, 'lease.property.required'),
    tenantId: z.string().optional(),
    buyerId: z.string().optional(),
    ownerId: z.string().min(1, 'lease.owner.required'),
    templateId: z.string().optional(),
    contractType: z.enum(['rental', 'sale']),
    status: z.enum(['DRAFT', 'ACTIVE', 'FINALIZED']),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    rentAmount: z.string().optional(),
    depositAmount: z.string().min(1, 'lease.deposit.required'),
    fiscalValue: z.string().optional(),
    currency: z.string().min(1),
    terms: z.string().optional(),
    paymentFrequency: z
      .enum(['monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'])
      .optional(),
    paymentDueDay: z.string().optional(),
    renewalAlertEnabled: z.enum(['yes', 'no']).default('yes'),
    renewalAlertPeriodicity: z
      .enum(['monthly', 'four_months', 'custom'])
      .default('monthly'),
    renewalAlertCustomDays: z.string().optional(),
    billingFrequency: z
      .enum(['first_of_month', 'last_of_month', 'contract_date', 'custom'])
      .optional(),
    billingDay: z.string().optional(),
    autoGenerateInvoices: z.enum(['yes', 'no']).default('yes'),
    lateFeeType: z
      .enum(['none', 'fixed', 'percentage', 'daily_fixed', 'daily_percentage'])
      .optional(),
    lateFeeValue: z.string().optional(),
    lateFeeGraceDays: z.string().optional(),
    lateFeeMax: z.string().optional(),
    adjustmentType: z
      .enum(['fixed', 'percentage', 'inflation_index'])
      .optional(),
    adjustmentValue: z.string().optional(),
    adjustmentFrequencyMonths: z.string().optional(),
    inflationIndexType: z.enum(['icl', 'ipc', 'igp_m']).optional(),
    nextAdjustmentDate: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.contractType === 'rental') {
      validateRentalValues(values, ctx);
    }

    if (values.contractType === 'sale') {
      validateSaleValues(values, ctx);
    }
  });

type FormValues = z.input<typeof schema>;

type LeaseFormProps = {
  mode: 'create' | 'edit';
  initial?: Lease;
  defaultPropertyId?: string;
  defaultOwnerId?: string;
  preselectedTenantId?: string;
  preselectedBuyerId?: string;
  preselectedPropertyOperations?: string;
  preselectedPropertyName?: string;
  preselectedOwnerName?: string;
  preselectedContractType?: ContractType;
  submitting?: boolean;
  onSubmit: (payload: CreateLeaseInput | UpdateLeaseInput) => Promise<void>;
  submitLabel: string;
  testIDPrefix?: string;
};

type SelectOption = { value: string; label: string };

type SelectFieldProps = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  helperText?: string;
  testID?: string;
};

const numberFieldToString = (
  value: number | null | undefined,
  fallback = '',
): string => (value === undefined || value === null ? fallback : String(value));

const booleanToYesNo = (value: boolean | undefined, fallback: 'yes' | 'no') => {
  if (value === undefined) {
    return fallback;
  }
  return value ? 'yes' : 'no';
};

const buildDefaultValues = ({
  defaultOwnerId,
  defaultPropertyId,
  initial,
  preselectedBuyerId,
  preselectedContractType,
  preselectedTenantId,
}: Pick<
  LeaseFormProps,
  'defaultOwnerId' | 'defaultPropertyId' | 'preselectedContractType'
> & {
  initial?: Lease;
  preselectedBuyerId?: string;
  preselectedTenantId?: string;
}): FormValues => ({
  propertyId: initial?.propertyId ?? defaultPropertyId ?? '',
  tenantId: initial?.tenantId ?? preselectedTenantId ?? '',
  buyerId: initial?.buyerId ?? preselectedBuyerId ?? '',
  ownerId: initial?.ownerId ?? defaultOwnerId ?? '',
  templateId: initial?.templateId ?? '',
  contractType: initial?.contractType ?? preselectedContractType ?? 'rental',
  status: initial?.status ?? 'DRAFT',
  startDate: initial?.startDate?.slice(0, 10) ?? '',
  endDate: initial?.endDate?.slice(0, 10) ?? '',
  rentAmount: numberFieldToString(initial?.rentAmount, '0'),
  depositAmount: numberFieldToString(initial?.depositAmount, '0'),
  fiscalValue: numberFieldToString(initial?.fiscalValue),
  currency: initial?.currency ?? 'ARS',
  terms: initial?.terms ?? '',
  paymentFrequency: initial?.paymentFrequency ?? 'monthly',
  paymentDueDay: numberFieldToString(initial?.paymentDueDay),
  renewalAlertEnabled: booleanToYesNo(initial?.renewalAlertEnabled, 'yes'),
  renewalAlertPeriodicity: initial?.renewalAlertPeriodicity ?? 'monthly',
  renewalAlertCustomDays: numberFieldToString(initial?.renewalAlertCustomDays),
  billingFrequency: initial?.billingFrequency ?? 'first_of_month',
  billingDay: numberFieldToString(initial?.billingDay),
  autoGenerateInvoices: booleanToYesNo(initial?.autoGenerateInvoices, 'yes'),
  lateFeeType: initial?.lateFeeType ?? 'none',
  lateFeeValue: numberFieldToString(initial?.lateFeeValue),
  lateFeeGraceDays: numberFieldToString(initial?.lateFeeGraceDays),
  lateFeeMax: numberFieldToString(initial?.lateFeeMax),
  adjustmentType: initial?.adjustmentType ?? 'fixed',
  adjustmentValue: numberFieldToString(initial?.adjustmentValue),
  adjustmentFrequencyMonths: numberFieldToString(
    initial?.adjustmentFrequencyMonths,
  ),
  inflationIndexType: initial?.inflationIndexType ?? 'icl',
  nextAdjustmentDate: initial?.nextAdjustmentDate?.slice(0, 10) ?? '',
});

const buildPropertyOptions = ({
  properties,
  shouldLockContractTypeByInterested,
  hasPreselectedBuyer,
  selectedProperty,
}: {
  properties: Property[];
  shouldLockContractTypeByInterested: boolean;
  hasPreselectedBuyer: boolean;
  selectedProperty?: Property;
}): Property[] => {
  const base = properties.filter((property) => {
    if (!shouldLockContractTypeByInterested) {
      return true;
    }

    const requiredOp = hasPreselectedBuyer ? 'sale' : 'rent';
    const ops = property.operations ?? [];
    return ops.length === 0 || ops.includes(requiredOp);
  });

  if (
    selectedProperty &&
    !base.some((item) => item.id === selectedProperty.id)
  ) {
    return [selectedProperty, ...base];
  }

  return base;
};

const applyCreateDefaults = ({
  mode,
  defaultPropertyId,
  preselectedTenantId,
  preselectedBuyerId,
  setValue,
}: {
  mode: LeaseFormProps['mode'];
  defaultPropertyId?: string;
  preselectedTenantId?: string;
  preselectedBuyerId?: string;
  setValue: UseFormSetValue<FormValues>;
}): void => {
  if (mode !== 'create') {
    return;
  }
  if (defaultPropertyId) {
    setValue('propertyId', defaultPropertyId, { shouldValidate: true });
  }
  if (preselectedTenantId) {
    setValue('tenantId', preselectedTenantId, { shouldValidate: true });
    setValue('contractType', 'rental', { shouldValidate: true });
  }
  if (preselectedBuyerId) {
    setValue('buyerId', preselectedBuyerId, { shouldValidate: true });
    setValue('contractType', 'sale', { shouldValidate: true });
  }
};

const syncSelectedPropertyOwner = ({
  selectedProperty,
  ownerId,
  setValue,
}: {
  selectedProperty?: Property;
  ownerId: string;
  setValue: UseFormSetValue<FormValues>;
}): void => {
  if (!selectedProperty?.ownerId || ownerId === selectedProperty.ownerId) {
    return;
  }

  setValue('ownerId', selectedProperty.ownerId, { shouldValidate: true });
};

const syncContractTypeFromSelectedProperty = ({
  selectedProperty,
  shouldLockContractTypeByInterested,
  hasPreselectedTenant,
  hasPreselectedBuyer,
  selectedPropertySupportsRent,
  selectedPropertySupportsSale,
  setValue,
}: {
  selectedProperty?: Property;
  shouldLockContractTypeByInterested: boolean;
  hasPreselectedTenant: boolean;
  hasPreselectedBuyer: boolean;
  selectedPropertySupportsRent: boolean;
  selectedPropertySupportsSale: boolean;
  setValue: UseFormSetValue<FormValues>;
}): void => {
  if (!selectedProperty) {
    return;
  }

  if (shouldLockContractTypeByInterested) {
    if (hasPreselectedTenant) {
      setValue('contractType', 'rental', { shouldValidate: true });
    }
    if (hasPreselectedBuyer) {
      setValue('contractType', 'sale', { shouldValidate: true });
    }
    return;
  }

  if (selectedPropertySupportsRent && !selectedPropertySupportsSale) {
    setValue('contractType', 'rental', { shouldValidate: true });
    setValue('buyerId', '', { shouldValidate: true });
    return;
  }

  if (!selectedPropertySupportsRent && selectedPropertySupportsSale) {
    setValue('contractType', 'sale', { shouldValidate: true });
    setValue('tenantId', '', { shouldValidate: true });
  }
};

const syncTemplateSelection = ({
  mode,
  singleTemplate,
  templatesForType,
  templateId,
  setValue,
}: {
  mode: LeaseFormProps['mode'];
  singleTemplate: LeaseTemplate | null;
  templatesForType: LeaseTemplate[];
  templateId?: string;
  setValue: UseFormSetValue<FormValues>;
}): void => {
  if (singleTemplate) {
    if (templateId !== singleTemplate.id) {
      setValue('templateId', singleTemplate.id, { shouldValidate: true });
    }
    return;
  }

  if (mode !== 'edit') {
    const valid = templatesForType.some(
      (template) => template.id === templateId,
    );
    if (!valid && templatesForType[0]) {
      setValue('templateId', templatesForType[0].id, { shouldValidate: true });
    }
  }
};

const resolveOwnerDisplayName = (
  selectedOwner: Owner | undefined,
  preselectedOwnerName?: string,
): string =>
  selectedOwner
    ? `${selectedOwner.firstName ?? ''} ${selectedOwner.lastName ?? ''}`.trim()
    : (preselectedOwnerName ?? '');

const syncRenderedTemplateTerms = ({
  selectedTemplate,
  selectedProperty,
  preselectedPropertyName,
  selectedOwner,
  preselectedOwnerName,
  tenantOptions,
  buyerOptions,
  tenantId,
  buyerId,
  terms,
  setValue,
}: {
  selectedTemplate?: LeaseTemplate | null;
  selectedProperty?: Property;
  preselectedPropertyName?: string;
  selectedOwner?: Owner;
  preselectedOwnerName?: string;
  tenantOptions: SelectOption[];
  buyerOptions: SelectOption[];
  tenantId?: string;
  buyerId?: string;
  terms?: string;
  setValue: UseFormSetValue<FormValues>;
}): void => {
  if (!selectedTemplate) {
    return;
  }

  const rendered = renderTemplateText(selectedTemplate.templateBody, {
    'property.name': selectedProperty?.name ?? preselectedPropertyName,
    'owner.fullName': resolveOwnerDisplayName(
      selectedOwner,
      preselectedOwnerName,
    ),
    'tenant.fullName':
      tenantOptions.find((item) => item.value === tenantId)?.label ?? '',
    'buyer.fullName':
      buyerOptions.find((item) => item.value === buyerId)?.label ?? '',
  });

  if ((terms ?? '').trim() !== rendered.trim()) {
    setValue('terms', rendered, { shouldValidate: true, shouldDirty: true });
  }
};

const buildLeasePayload = ({
  data,
  selectedPropertyOwnerId,
  documents,
}: {
  data: FormValues;
  selectedPropertyOwnerId?: string;
  documents: string[];
}): CreateLeaseInput => {
  const basePayload: CreateLeaseInput = {
    propertyId: data.propertyId,
    ownerId: selectedPropertyOwnerId ?? data.ownerId,
    templateId: data.templateId || undefined,
    contractType: data.contractType,
    status: data.status,
    depositAmount: Number(data.depositAmount),
    currency: data.currency,
    terms: data.terms || undefined,
    documents,
  };

  if (data.contractType === 'sale') {
    return {
      ...basePayload,
      buyerId: data.buyerId || undefined,
      fiscalValue: toNumberOrUndefined(data.fiscalValue),
    };
  }

  const hasRenewalAlert = data.renewalAlertEnabled === 'yes';
  const hasLateFee = Boolean(data.lateFeeType) && data.lateFeeType !== 'none';
  const hasAdjustments =
    Boolean(data.adjustmentType) && data.adjustmentType !== 'fixed';
  const usesInflationIndex = data.adjustmentType === 'inflation_index';

  return {
    ...basePayload,
    tenantId: data.tenantId || undefined,
    startDate: data.startDate || undefined,
    endDate: data.endDate || undefined,
    rentAmount: toNumberOrUndefined(data.rentAmount),
    paymentFrequency: data.paymentFrequency || undefined,
    paymentDueDay: toNumberOrUndefined(data.paymentDueDay),
    renewalAlertEnabled: hasRenewalAlert,
    renewalAlertPeriodicity: hasRenewalAlert
      ? data.renewalAlertPeriodicity || undefined
      : undefined,
    renewalAlertCustomDays:
      hasRenewalAlert && data.renewalAlertPeriodicity === 'custom'
        ? toNumberOrUndefined(data.renewalAlertCustomDays)
        : undefined,
    billingFrequency: data.billingFrequency || undefined,
    billingDay: toNumberOrUndefined(data.billingDay),
    autoGenerateInvoices: data.autoGenerateInvoices === 'yes',
    lateFeeType: data.lateFeeType || undefined,
    lateFeeValue: hasLateFee
      ? toNumberOrUndefined(data.lateFeeValue)
      : undefined,
    lateFeeGraceDays: hasLateFee
      ? toNumberOrUndefined(data.lateFeeGraceDays)
      : undefined,
    lateFeeMax: hasLateFee ? toNumberOrUndefined(data.lateFeeMax) : undefined,
    adjustmentType: data.adjustmentType || undefined,
    adjustmentValue: hasAdjustments
      ? toNumberOrUndefined(data.adjustmentValue)
      : undefined,
    adjustmentFrequencyMonths: hasAdjustments
      ? toNumberOrUndefined(data.adjustmentFrequencyMonths)
      : undefined,
    inflationIndexType: usesInflationIndex
      ? data.inflationIndexType || undefined
      : undefined,
    nextAdjustmentDate: hasAdjustments
      ? data.nextAdjustmentDate || undefined
      : undefined,
  };
};

const getContractTypeHelperText = ({
  shouldLockContractTypeByInterested,
  shouldShowContractTypeSelect,
  t,
}: {
  shouldLockContractTypeByInterested: boolean;
  shouldShowContractTypeSelect: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}): string | undefined => {
  if (shouldLockContractTypeByInterested) {
    return t('leases.contractTypeFixedByInterested');
  }
  if (!shouldShowContractTypeSelect) {
    return t('leases.contractTypeFixedByProperty');
  }
  return undefined;
};

function ReadOnlyValueField({
  helperText,
  label,
  value,
}: Readonly<{
  helperText?: string;
  label: string;
  value: string;
}>) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.readOnlyValue}>{value}</Text>
      {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
    </View>
  );
}

type LeaseHeaderFieldsProps = Readonly<{
  control: Control<FormValues>;
  hasPreselectedProperty: boolean;
  ownerDisplay: string;
  propertyDisplay: string;
  propertyOptions: Property[];
  shouldLockContractTypeByInterested: boolean;
  shouldShowContractTypeSelect: boolean;
  singleTemplate: LeaseTemplate | null;
  t: (key: string, options?: Record<string, unknown>) => string;
  templatesForType: LeaseTemplate[];
  testIDPrefix: string;
}>;

function LeaseHeaderFields({
  control,
  hasPreselectedProperty,
  ownerDisplay,
  propertyDisplay,
  propertyOptions,
  shouldLockContractTypeByInterested,
  shouldShowContractTypeSelect,
  singleTemplate,
  t,
  templatesForType,
  testIDPrefix,
}: LeaseHeaderFieldsProps) {
  const contractTypeHelperText = getContractTypeHelperText({
    shouldLockContractTypeByInterested,
    shouldShowContractTypeSelect,
    t,
  });
  const templateHelperText = singleTemplate
    ? t('leases.templateLockedHint')
    : t('leases.templateAutofillHint');

  return (
    <>
      <Text style={styles.sectionTitle}>{t('leases.leaseDetails')}</Text>
      {hasPreselectedProperty ? (
        <ReadOnlyValueField
          helperText={t('leases.prefilledFieldHint')}
          label={t('leases.fields.property')}
          value={propertyDisplay}
        />
      ) : (
        <Controller
          control={control}
          name="propertyId"
          render={({ field }) => (
            <SelectField
              label={t('leases.fields.property')}
              value={field.value}
              onChange={field.onChange}
              options={propertyOptions.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
              placeholder={t('leases.selectProperty')}
              testID={`${testIDPrefix}.propertyId`}
            />
          )}
        />
      )}

      <Controller
        control={control}
        name="contractType"
        render={({ field }) => (
          <SelectField
            label={t('leases.fields.contractType')}
            value={field.value}
            onChange={field.onChange}
            options={contractTypeOptions.map((option) => ({
              value: option.value,
              label: t(`leases.contractTypes.${option.value}`),
            }))}
            disabled={!shouldShowContractTypeSelect}
            helperText={contractTypeHelperText}
            testID={`${testIDPrefix}.contractType`}
          />
        )}
      />

      <Controller
        control={control}
        name="templateId"
        render={({ field }) => (
          <SelectField
            label={t('leases.fields.template')}
            value={field.value ?? ''}
            onChange={field.onChange}
            options={templatesForType.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            placeholder={t('leases.templates.none')}
            disabled={Boolean(singleTemplate)}
            helperText={templateHelperText}
            testID={`${testIDPrefix}.templateId`}
          />
        )}
      />

      <ReadOnlyValueField
        helperText={t('leases.ownerFromPropertyHint')}
        label={t('leases.fields.owner')}
        value={ownerDisplay}
      />

      <Controller
        control={control}
        name="status"
        render={({ field }) => (
          <SelectField
            label={t('leases.fields.status')}
            value={field.value}
            onChange={field.onChange}
            options={statusOptions.map((option) => ({
              value: option.value,
              label: t(`leases.status.${option.value}`),
            }))}
            testID={`${testIDPrefix}.status`}
          />
        )}
      />
    </>
  );
}

type LeasePartyFieldsProps = Readonly<{
  buyerOptions: SelectOption[];
  contractType: FormValues['contractType'];
  control: Control<FormValues>;
  currencyOptions: SelectOption[];
  hasPreselectedBuyer: boolean;
  hasPreselectedTenant: boolean;
  onOpenDatePicker: (target: 'startDate' | 'endDate') => void;
  preselectedBuyerId?: string;
  preselectedTenantId?: string;
  t: (key: string, options?: Record<string, unknown>) => string;
  tenantOptions: SelectOption[];
  testIDPrefix: string;
  values: FormValues;
}>;

function DatePickerField({
  label,
  onPress,
  testID,
  value,
}: Readonly<{
  label: string;
  onPress: () => void;
  testID: string;
  value: string;
}>) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable onPress={onPress} style={styles.selectTrigger} testID={testID}>
        <Text style={styles.selectTriggerText}>{value || label}</Text>
        <Text style={styles.selectIndicator}>▾</Text>
      </Pressable>
    </View>
  );
}

function LeasePartyFields({
  buyerOptions,
  contractType,
  control,
  currencyOptions,
  hasPreselectedBuyer,
  hasPreselectedTenant,
  onOpenDatePicker,
  preselectedBuyerId,
  preselectedTenantId,
  t,
  tenantOptions,
  testIDPrefix,
  values,
}: LeasePartyFieldsProps) {
  const selectedTenantLabel =
    tenantOptions.find((item) => item.value === values.tenantId)?.label ??
    preselectedTenantId ??
    '';
  const selectedBuyerLabel =
    buyerOptions.find((item) => item.value === values.buyerId)?.label ??
    preselectedBuyerId ??
    '';

  return (
    <>
      {contractType === 'rental' ? (
        <>
          {hasPreselectedTenant ? (
            <ReadOnlyValueField
              helperText={t('leases.prefilledFieldHint')}
              label={t('leases.fields.tenant')}
              value={selectedTenantLabel}
            />
          ) : (
            <Controller
              control={control}
              name="tenantId"
              render={({ field }) => (
                <SelectField
                  label={t('leases.fields.tenant')}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  options={tenantOptions}
                  placeholder={t('leases.selectTenant')}
                  testID={`${testIDPrefix}.tenantId`}
                />
              )}
            />
          )}

          <Controller
            control={control}
            name="startDate"
            render={({ field }) => (
              <DatePickerField
                label={t('leases.startDate')}
                onPress={() => onOpenDatePicker('startDate')}
                testID={`${testIDPrefix}.startDate`}
                value={field.value ?? ''}
              />
            )}
          />
          <Controller
            control={control}
            name="endDate"
            render={({ field }) => (
              <DatePickerField
                label={t('leases.endDate')}
                onPress={() => onOpenDatePicker('endDate')}
                testID={`${testIDPrefix}.endDate`}
                value={field.value ?? ''}
              />
            )}
          />
        </>
      ) : (
        <>
          {hasPreselectedBuyer ? (
            <ReadOnlyValueField
              helperText={t('leases.prefilledFieldHint')}
              label={t('leases.fields.buyer')}
              value={selectedBuyerLabel}
            />
          ) : (
            <Controller
              control={control}
              name="buyerId"
              render={({ field }) => (
                <SelectField
                  label={t('leases.fields.buyer')}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  options={buyerOptions}
                  placeholder={t('leases.selectBuyer')}
                  testID={`${testIDPrefix}.buyerId`}
                />
              )}
            />
          )}
          <Controller
            control={control}
            name="fiscalValue"
            render={({ field }) => (
              <Field
                label={t('leases.fields.fiscalValue')}
                value={field.value ?? ''}
                onChangeText={field.onChange}
                keyboardType="numeric"
                testID={`${testIDPrefix}.fiscalValue`}
              />
            )}
          />
        </>
      )}

      {contractType === 'rental' ? (
        <Controller
          control={control}
          name="rentAmount"
          render={({ field }) => (
            <Field
              label={t('leases.fields.rentAmount')}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              keyboardType="numeric"
              testID={`${testIDPrefix}.rentAmount`}
            />
          )}
        />
      ) : null}

      <Controller
        control={control}
        name="depositAmount"
        render={({ field }) => (
          <Field
            label={t('leases.fields.depositAmount')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            keyboardType="numeric"
            testID={`${testIDPrefix}.depositAmount`}
          />
        )}
      />

      <Controller
        control={control}
        name="currency"
        render={({ field }) => (
          <SelectField
            label={t('properties.fields.saleCurrency')}
            value={field.value}
            onChange={field.onChange}
            options={currencyOptions}
            testID={`${testIDPrefix}.currency`}
          />
        )}
      />
    </>
  );
}

type RentalSettingsFieldsProps = Readonly<{
  control: Control<FormValues>;
  contractType: FormValues['contractType'];
  t: (key: string, options?: Record<string, unknown>) => string;
  testIDPrefix: string;
  values: FormValues;
}>;

function RentalSettingsFields({
  control,
  contractType,
  t,
  testIDPrefix,
  values,
}: RentalSettingsFieldsProps) {
  if (contractType !== 'rental') {
    return null;
  }

  const hasRenewalAlerts = values.renewalAlertEnabled === 'yes';
  const hasLateFee = (values.lateFeeType ?? 'none') !== 'none';
  const hasAdjustments = (values.adjustmentType ?? 'fixed') !== 'fixed';
  const showPercentageAdjustment = values.adjustmentType === 'percentage';
  const showInflationIndex = values.adjustmentType === 'inflation_index';

  return (
    <>
      <Text style={styles.sectionTitle}>{t('leases.billing.title')}</Text>
      <Controller
        control={control}
        name="paymentFrequency"
        render={({ field }) => (
          <SelectField
            label={t('leases.fields.paymentFrequency')}
            value={field.value ?? 'monthly'}
            onChange={field.onChange}
            options={paymentFrequencyOptions.map((option) => ({
              value: option.value,
              label: t(`leases.paymentFrequencies.${option.value}`),
            }))}
            testID={`${testIDPrefix}.paymentFrequency`}
          />
        )}
      />
      <Controller
        control={control}
        name="billingFrequency"
        render={({ field }) => (
          <SelectField
            label={t('leases.fields.billingFrequency')}
            value={field.value ?? 'first_of_month'}
            onChange={field.onChange}
            options={billingFrequencyOptions.map((option) => ({
              value: option.value,
              label: t(`leases.billingFrequencies.${option.value}`),
            }))}
            testID={`${testIDPrefix}.billingFrequency`}
          />
        )}
      />
      <Controller
        control={control}
        name="billingDay"
        render={({ field }) => (
          <Field
            label={t('leases.fields.billingDay')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            keyboardType="numeric"
            testID={`${testIDPrefix}.billingDay`}
          />
        )}
      />
      <Controller
        control={control}
        name="paymentDueDay"
        render={({ field }) => (
          <Field
            label={t('leases.fields.paymentDueDay')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            keyboardType="numeric"
            testID={`${testIDPrefix}.paymentDueDay`}
          />
        )}
      />
      <Controller
        control={control}
        name="autoGenerateInvoices"
        render={({ field }) => (
          <SelectField
            label={t('leases.fields.autoGenerateInvoices')}
            value={field.value ?? 'yes'}
            onChange={field.onChange}
            options={autoGenerateOptions.map((option) => ({
              value: option.value,
              label: option.value === 'yes' ? t('common.yes') : t('common.no'),
            }))}
            testID={`${testIDPrefix}.autoGenerateInvoices`}
          />
        )}
      />

      <Text style={styles.sectionTitle}>
        {t('leases.renewalAlerts.title', {
          defaultValue: 'Alertas de renovacion',
        })}
      </Text>
      <Controller
        control={control}
        name="renewalAlertEnabled"
        render={({ field }) => (
          <SelectField
            label={t('leases.fields.renewalAlertEnabled', {
              defaultValue: 'Alertas automaticas',
            })}
            value={field.value ?? 'yes'}
            onChange={field.onChange}
            options={renewalAlertEnabledOptions.map((option) => ({
              value: option.value,
              label: option.value === 'yes' ? t('common.yes') : t('common.no'),
            }))}
            helperText={t('leases.renewalAlerts.helper', {
              defaultValue:
                'Permite anticipar vencimientos para hablar con propietarios y renovar.',
            })}
            testID={`${testIDPrefix}.renewalAlertEnabled`}
          />
        )}
      />
      {hasRenewalAlerts ? (
        <>
          <Controller
            control={control}
            name="renewalAlertPeriodicity"
            render={({ field }) => (
              <SelectField
                label={t('leases.fields.renewalAlertPeriodicity', {
                  defaultValue: 'Periodicidad',
                })}
                value={field.value ?? 'monthly'}
                onChange={field.onChange}
                options={renewalAlertPeriodicityOptions.map((option) => ({
                  value: option.value,
                  label: t(`leases.renewalAlertPeriodicity.${option.value}`, {
                    defaultValue: option.label,
                  }),
                }))}
                testID={`${testIDPrefix}.renewalAlertPeriodicity`}
              />
            )}
          />
          {values.renewalAlertPeriodicity === 'custom' ? (
            <Controller
              control={control}
              name="renewalAlertCustomDays"
              render={({ field }) => (
                <Field
                  label={t('leases.fields.renewalAlertCustomDays', {
                    defaultValue: 'Dias de anticipacion',
                  })}
                  value={field.value ?? ''}
                  onChangeText={field.onChange}
                  keyboardType="numeric"
                  testID={`${testIDPrefix}.renewalAlertCustomDays`}
                />
              )}
            />
          ) : null}
        </>
      ) : null}

      <Text style={styles.sectionTitle}>{t('leases.lateFees.title')}</Text>
      <Controller
        control={control}
        name="lateFeeType"
        render={({ field }) => (
          <SelectField
            label={t('leases.fields.lateFeeType')}
            value={field.value ?? 'none'}
            onChange={field.onChange}
            options={lateFeeTypeOptions.map((option) => ({
              value: option.value,
              label: t(`leases.lateFeeTypes.${option.value}`),
            }))}
            testID={`${testIDPrefix}.lateFeeType`}
          />
        )}
      />
      {hasLateFee ? (
        <>
          <Controller
            control={control}
            name="lateFeeValue"
            render={({ field }) => (
              <Field
                label={t('leases.fields.lateFeeValue')}
                value={field.value ?? ''}
                onChangeText={field.onChange}
                keyboardType="numeric"
                testID={`${testIDPrefix}.lateFeeValue`}
              />
            )}
          />
          <Controller
            control={control}
            name="lateFeeGraceDays"
            render={({ field }) => (
              <Field
                label={t('leases.fields.lateFeeGraceDays')}
                value={field.value ?? ''}
                onChangeText={field.onChange}
                keyboardType="numeric"
                testID={`${testIDPrefix}.lateFeeGraceDays`}
              />
            )}
          />
          <Controller
            control={control}
            name="lateFeeMax"
            render={({ field }) => (
              <Field
                label={t('leases.fields.lateFeeMax')}
                value={field.value ?? ''}
                onChangeText={field.onChange}
                keyboardType="numeric"
                testID={`${testIDPrefix}.lateFeeMax`}
              />
            )}
          />
        </>
      ) : null}

      <Text style={styles.sectionTitle}>{t('leases.adjustments.title')}</Text>
      <Controller
        control={control}
        name="adjustmentType"
        render={({ field }) => (
          <SelectField
            label={t('leases.fields.adjustmentType')}
            value={field.value ?? 'fixed'}
            onChange={field.onChange}
            options={adjustmentTypeOptions.map((option) => ({
              value: option.value,
              label: t(`leases.adjustmentTypes.${option.value}`),
            }))}
            testID={`${testIDPrefix}.adjustmentType`}
          />
        )}
      />

      {hasAdjustments ? (
        <>
          {showPercentageAdjustment ? (
            <Controller
              control={control}
              name="adjustmentValue"
              render={({ field }) => (
                <Field
                  label={t('leases.fields.adjustmentValue')}
                  value={field.value ?? ''}
                  onChangeText={field.onChange}
                  keyboardType="numeric"
                  testID={`${testIDPrefix}.adjustmentValue`}
                />
              )}
            />
          ) : null}

          {showInflationIndex ? (
            <Controller
              control={control}
              name="inflationIndexType"
              render={({ field }) => (
                <SelectField
                  label={t('leases.fields.inflationIndexType')}
                  value={field.value ?? 'icl'}
                  onChange={field.onChange}
                  options={inflationIndexOptions.map((option) => ({
                    value: option.value,
                    label: t(`leases.inflationIndexTypes.${option.value}`),
                  }))}
                  testID={`${testIDPrefix}.inflationIndexType`}
                />
              )}
            />
          ) : null}

          <Controller
            control={control}
            name="adjustmentFrequencyMonths"
            render={({ field }) => (
              <Field
                label={t('leases.fields.adjustmentFrequencyMonths')}
                value={field.value ?? ''}
                onChangeText={field.onChange}
                keyboardType="numeric"
                testID={`${testIDPrefix}.adjustmentFrequencyMonths`}
              />
            )}
          />
          <Controller
            control={control}
            name="nextAdjustmentDate"
            render={({ field }) => (
              <Field
                label={t('leases.fields.nextAdjustmentDate')}
                value={field.value ?? ''}
                onChangeText={field.onChange}
                testID={`${testIDPrefix}.nextAdjustmentDate`}
              />
            )}
          />
        </>
      ) : null}
    </>
  );
}

function FormErrorsList({
  errors,
  resolveErrorMessage,
}: Readonly<{
  errors: FieldErrors<FormValues>;
  resolveErrorMessage: (message: string) => string;
}>) {
  return (
    <>
      {Object.values(errors).map((item) => {
        if (!item?.message) {
          return null;
        }
        const message = resolveErrorMessage(item.message);
        return (
          <Text key={`${item.message}-${message}`} style={styles.error}>
            {message}
          </Text>
        );
      })}
    </>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = i18n.t('forms.selectOption'),
  disabled,
  helperText,
  testID,
}: Readonly<SelectFieldProps>) {
  const [open, setOpen] = useState(false);
  const selectedLabel =
    options.find((item) => item.value === value)?.label ??
    (value || placeholder);

  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        onPress={() => {
          if (!disabled) {
            setOpen((current) => !current);
          }
        }}
        style={[styles.selectTrigger, disabled && styles.selectTriggerDisabled]}
        testID={testID}
      >
        <Text
          style={[
            styles.selectTriggerText,
            disabled && styles.selectTriggerTextDisabled,
          ]}
        >
          {selectedLabel || placeholder}
        </Text>
        {disabled ? null : (
          <Text style={styles.selectIndicator}>{open ? '▴' : '▾'}</Text>
        )}
      </Pressable>
      {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
      {open && !disabled ? (
        <View style={styles.selectMenu}>
          {options.map((option, index) => {
            const selected = option.value === value;
            const isLast = index === options.length - 1;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={[
                  styles.selectOption,
                  selected && styles.selectOptionSelected,
                  isLast && styles.selectOptionLast,
                ]}
                testID={testID ? `${testID}.${option.value}` : undefined}
              >
                <Text
                  style={[
                    styles.selectOptionText,
                    selected && styles.selectOptionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const statusOptions: SelectOption[] = [
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'ACTIVE', label: 'Activo' },
  { value: 'FINALIZED', label: 'Finalizado' },
];

const contractTypeOptions: SelectOption[] = [
  { value: 'rental', label: 'Alquiler' },
  { value: 'sale', label: 'Venta' },
];

const paymentFrequencyOptions: SelectOption[] = [
  { value: 'monthly', label: 'Mensual' },
  { value: 'bimonthly', label: 'Bimestral' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'annual', label: 'Anual' },
];

const billingFrequencyOptions: SelectOption[] = [
  { value: 'first_of_month', label: 'Primero de mes' },
  { value: 'last_of_month', label: 'Ultimo de mes' },
  { value: 'contract_date', label: 'Dia de contrato' },
  { value: 'custom', label: 'Personalizado' },
];

const lateFeeTypeOptions: SelectOption[] = [
  { value: 'none', label: 'Sin mora' },
  { value: 'fixed', label: 'Monto fijo' },
  { value: 'percentage', label: 'Porcentaje' },
  { value: 'daily_fixed', label: 'Fijo diario' },
  { value: 'daily_percentage', label: 'Porcentaje diario' },
];

const adjustmentTypeOptions: SelectOption[] = [
  { value: 'fixed', label: 'Fijo' },
  { value: 'percentage', label: 'Porcentaje' },
  { value: 'inflation_index', label: 'Indice inflacion' },
];

const inflationIndexOptions: SelectOption[] = [
  { value: 'icl', label: 'ICL' },
  { value: 'ipc', label: 'IPC' },
  { value: 'igp_m', label: 'IGP-M' },
];

const autoGenerateOptions: SelectOption[] = [
  { value: 'yes', label: 'Si' },
  { value: 'no', label: 'No' },
];

const renewalAlertEnabledOptions: SelectOption[] = [
  { value: 'yes', label: 'Si' },
  { value: 'no', label: 'No' },
];

const renewalAlertPeriodicityOptions: Array<{
  value: LeaseRenewalAlertPeriodicity;
  label: string;
}> = [
  { value: 'monthly', label: 'Mensual' },
  { value: 'four_months', label: 'Cada cuatro meses' },
  { value: 'custom', label: 'Personalizado' },
];

const parseOps = (raw?: string | null): Array<'rent' | 'sale'> =>
  (raw ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(
      (item): item is 'rent' | 'sale' => item === 'rent' || item === 'sale',
    );

const toNumberOrUndefined = (value?: string): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const toDateString = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateOrToday = (value?: string): Date => {
  if (!value) {
    return new Date();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const profileOps = (profile: InterestedProfile): Array<'rent' | 'sale'> => {
  let source = profile.operations ?? [];
  if (source.length === 0 && profile.operation) {
    source = [profile.operation];
  }
  return source.filter(
    (item): item is 'rent' | 'sale' => item === 'rent' || item === 'sale',
  );
};

const profileLabel = (profile: InterestedProfile): string =>
  `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() ||
  profile.email ||
  profile.phone;

const renderTemplateText = (
  templateBody: string,
  context: Record<string, string | undefined>,
): string => {
  return templateBody.replaceAll(
    /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}|\{([a-zA-Z0-9_.]+)\}/g,
    (_full, keyA, keyB) => {
      const key = (keyA ?? keyB) as string;
      return context[key] ?? '';
    },
  );
};

export function LeaseForm({
  mode,
  initial,
  defaultPropertyId,
  defaultOwnerId,
  preselectedTenantId,
  preselectedBuyerId,
  preselectedPropertyOperations,
  preselectedPropertyName,
  preselectedOwnerName,
  preselectedContractType,
  submitting,
  onSubmit,
  submitLabel,
  testIDPrefix = 'leaseForm',
}: Readonly<LeaseFormProps>) {
  const { t } = useTranslation();
  const [datePickerTarget, setDatePickerTarget] = useState<
    'startDate' | 'endDate' | null
  >(null);
  const [datePickerValue, setDatePickerValue] = useState<Date>(new Date());
  const defaults: FormValues = useMemo(
    () =>
      buildDefaultValues({
        defaultOwnerId,
        defaultPropertyId,
        initial,
        preselectedBuyerId,
        preselectedContractType,
        preselectedTenantId,
      }),
    [
      defaultOwnerId,
      defaultPropertyId,
      initial,
      preselectedBuyerId,
      preselectedContractType,
      preselectedTenantId,
    ],
  );

  const { control, watch, setValue, handleSubmit, formState } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: defaults,
    });

  const propertiesQuery = useQuery({
    queryKey: ['properties'],
    queryFn: propertiesApi.getAll,
  });
  const interestedQuery = useQuery({
    queryKey: ['interested'],
    queryFn: interestedApi.getAll,
  });
  const buyersQuery = useQuery({
    queryKey: ['buyers'],
    queryFn: () => buyersApi.getAll({ limit: 100 }),
  });
  const ownersQuery = useQuery({
    queryKey: ['owners'],
    queryFn: ownersApi.getAll,
  });
  const templatesQuery = useQuery({
    queryKey: ['leases', 'templates'],
    queryFn: () => leasesApi.getTemplates(),
  });
  const currenciesQuery = useQuery({
    queryKey: ['currencies'],
    queryFn: currenciesApi.getAll,
  });

  const values = watch();
  const contractType = values.contractType ?? 'rental';
  const hasPreselectedProperty =
    mode === 'create' && Boolean(defaultPropertyId);
  const hasPreselectedTenant =
    mode === 'create' && Boolean(preselectedTenantId);
  const hasPreselectedBuyer = mode === 'create' && Boolean(preselectedBuyerId);
  const shouldLockContractTypeByInterested =
    mode === 'create' && (hasPreselectedTenant || hasPreselectedBuyer);

  const selectedProperty = useMemo(
    () =>
      (propertiesQuery.data ?? []).find(
        (item) => item.id === values.propertyId,
      ),
    [propertiesQuery.data, values.propertyId],
  );

  const selectedPropertyOps = useMemo(() => {
    const fromProperty = selectedProperty?.operations?.length
      ? selectedProperty.operations
      : [];
    if (fromProperty.length > 0) {
      return fromProperty;
    }
    return parseOps(preselectedPropertyOperations);
  }, [preselectedPropertyOperations, selectedProperty]);

  const selectedPropertySupportsRent = selectedPropertyOps.includes('rent');
  const selectedPropertySupportsSale = selectedPropertyOps.includes('sale');

  const shouldShowContractTypeSelect =
    !shouldLockContractTypeByInterested &&
    selectedPropertySupportsRent &&
    selectedPropertySupportsSale;

  const propertyOptions = useMemo(() => {
    return buildPropertyOptions({
      properties: propertiesQuery.data ?? [],
      shouldLockContractTypeByInterested,
      hasPreselectedBuyer,
      selectedProperty,
    });
  }, [
    hasPreselectedBuyer,
    selectedProperty,
    shouldLockContractTypeByInterested,
    propertiesQuery.data,
  ]);

  const selectedOwner = useMemo(
    () => (ownersQuery.data ?? []).find((item) => item.id === values.ownerId),
    [ownersQuery.data, values.ownerId],
  );

  const interestedProfiles = interestedQuery.data?.data ?? [];

  const tenantOptions = useMemo(() => {
    const source = interestedProfiles
      .filter(
        (profile) =>
          Boolean(profile.convertedToTenantId) &&
          profileOps(profile).includes('rent'),
      )
      .map((profile) => ({
        value: profile.convertedToTenantId as string,
        label: profileLabel(profile),
      }));
    return source.filter(
      (option, index) =>
        source.findIndex((item) => item.value === option.value) === index,
    );
  }, [interestedProfiles]);

  const buyerOptions = useMemo(
    () =>
      (buyersQuery.data ?? []).map((buyer) => ({
        value: buyer.id,
        label:
          `${buyer.firstName ?? ''} ${buyer.lastName ?? ''}`.trim() ||
          buyer.email ||
          buyer.phone ||
          buyer.id,
      })),
    [buyersQuery.data],
  );

  const templatesForType = useMemo(
    () =>
      (templatesQuery.data ?? []).filter(
        (item) => item.contractType === contractType,
      ),
    [contractType, templatesQuery.data],
  );
  const singleTemplate =
    templatesForType.length === 1 ? templatesForType[0] : null;

  const selectedTemplate = useMemo(
    () =>
      (templatesQuery.data ?? []).find((item) => item.id === values.templateId),
    [templatesQuery.data, values.templateId],
  );

  useEffect(() => {
    applyCreateDefaults({
      mode,
      defaultPropertyId,
      preselectedTenantId,
      preselectedBuyerId,
      setValue,
    });
  }, [
    defaultPropertyId,
    mode,
    preselectedBuyerId,
    preselectedTenantId,
    setValue,
  ]);

  useEffect(() => {
    syncSelectedPropertyOwner({
      selectedProperty,
      ownerId: values.ownerId,
      setValue,
    });
  }, [selectedProperty, setValue, values.ownerId]);

  useEffect(() => {
    syncContractTypeFromSelectedProperty({
      selectedProperty,
      shouldLockContractTypeByInterested,
      hasPreselectedTenant,
      hasPreselectedBuyer,
      selectedPropertySupportsRent,
      selectedPropertySupportsSale,
      setValue,
    });
  }, [
    hasPreselectedBuyer,
    hasPreselectedTenant,
    selectedProperty,
    selectedPropertySupportsRent,
    selectedPropertySupportsSale,
    setValue,
    shouldLockContractTypeByInterested,
  ]);

  useEffect(() => {
    syncTemplateSelection({
      mode,
      singleTemplate,
      templatesForType,
      templateId: values.templateId,
      setValue,
    });
  }, [mode, setValue, singleTemplate, templatesForType, values.templateId]);

  useEffect(() => {
    syncRenderedTemplateTerms({
      selectedTemplate,
      selectedProperty,
      preselectedPropertyName,
      selectedOwner,
      preselectedOwnerName,
      tenantOptions,
      buyerOptions,
      tenantId: values.tenantId,
      buyerId: values.buyerId,
      terms: values.terms,
      setValue,
    });
  }, [
    buyerOptions,
    preselectedOwnerName,
    preselectedPropertyName,
    selectedOwner,
    selectedProperty?.name,
    selectedTemplate,
    setValue,
    tenantOptions,
    values.buyerId,
    values.tenantId,
    values.terms,
  ]);

  const currencyOptions: SelectOption[] = useMemo(() => {
    const fromApi = (currenciesQuery.data ?? []).map((item) => ({
      value: item.code,
      label: item.code,
    }));
    if (fromApi.length === 0) {
      return [
        { value: 'ARS', label: 'ARS' },
        { value: 'USD', label: 'USD' },
      ];
    }
    if (
      values.currency &&
      !fromApi.some((item) => item.value === values.currency)
    ) {
      return [{ value: values.currency, label: values.currency }, ...fromApi];
    }
    return fromApi;
  }, [currenciesQuery.data, values.currency]);

  const ownerDisplay = selectedOwner
    ? `${selectedOwner.firstName ?? ''} ${selectedOwner.lastName ?? ''}`.trim() ||
      selectedOwner.email
    : preselectedOwnerName || '-';
  const propertyDisplay =
    selectedProperty?.name || preselectedPropertyName || '-';

  const submit = handleSubmit(async (data) => {
    await onSubmit(
      buildLeasePayload({
        data,
        selectedPropertyOwnerId: selectedProperty?.ownerId,
        documents: initial?.documents ?? [],
      }),
    );
  });

  const handleOpenDatePicker = (target: 'startDate' | 'endDate') => {
    const current = target === 'startDate' ? values.startDate : values.endDate;
    setDatePickerValue(parseDateOrToday(current));
    setDatePickerTarget(target);
  };

  const handleDateChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (Platform.OS === 'android') {
      setDatePickerTarget(null);
    }
    if (event.type === 'dismissed' || !selectedDate || !datePickerTarget) {
      return;
    }

    const next = toDateString(selectedDate);
    setValue(datePickerTarget, next, {
      shouldValidate: true,
      shouldDirty: true,
    });

    if (Platform.OS === 'ios') {
      setDatePickerTarget(null);
    }
  };

  const resolveErrorMessage = (message: string): string => {
    switch (message) {
      case 'lease.property.required':
        return t('leases.selectProperty');
      case 'lease.owner.required':
        return t('validation.ownerRequired');
      case 'lease.deposit.required':
        return t('validation.required');
      case 'lease.tenant.required':
        return t('validation.tenantRequired');
      case 'lease.startDate.required':
        return t('validation.startDateRequired');
      case 'lease.endDate.required':
        return t('validation.endDateRequired');
      case 'lease.rentAmount.required':
        return t('validation.rentAmountPositive');
      case 'lease.buyer.required':
        return t('leases.selectBuyer');
      case 'lease.fiscalValue.required':
        return t('leases.fields.fiscalValue');
      case 'lease.renewalAlertCustomDays.required':
        return t('validation.required');
      default:
        return message;
    }
  };

  return (
    <View>
      <LeaseHeaderFields
        control={control}
        hasPreselectedProperty={hasPreselectedProperty}
        ownerDisplay={ownerDisplay}
        propertyDisplay={propertyDisplay}
        propertyOptions={propertyOptions}
        shouldLockContractTypeByInterested={shouldLockContractTypeByInterested}
        shouldShowContractTypeSelect={shouldShowContractTypeSelect}
        singleTemplate={singleTemplate}
        t={t}
        templatesForType={templatesForType}
        testIDPrefix={testIDPrefix}
      />

      <LeasePartyFields
        buyerOptions={buyerOptions}
        contractType={contractType}
        control={control}
        currencyOptions={currencyOptions}
        hasPreselectedBuyer={hasPreselectedBuyer}
        hasPreselectedTenant={hasPreselectedTenant}
        onOpenDatePicker={handleOpenDatePicker}
        preselectedBuyerId={preselectedBuyerId}
        preselectedTenantId={preselectedTenantId}
        t={t}
        tenantOptions={tenantOptions}
        testIDPrefix={testIDPrefix}
        values={values}
      />

      <RentalSettingsFields
        contractType={contractType}
        control={control}
        t={t}
        testIDPrefix={testIDPrefix}
        values={values}
      />

      <Controller
        control={control}
        name="terms"
        render={({ field }) => (
          <Field
            label={t('leases.fields.terms')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            editable={!selectedTemplate}
            testID={`${testIDPrefix}.terms`}
          />
        )}
      />

      <FormErrorsList
        errors={formState.errors}
        resolveErrorMessage={resolveErrorMessage}
      />

      <AppButton
        title={submitLabel}
        onPress={submit}
        loading={submitting}
        disabled={submitting}
        testID={`${testIDPrefix}.submit`}
      />
      {datePickerTarget ? (
        <DateTimePicker
          value={datePickerValue}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
          testID={`${testIDPrefix}.${datePickerTarget}.picker`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 16,
    marginTop: 4,
    marginBottom: 8,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    marginBottom: 8,
    color: '#1f2937',
    fontWeight: '600',
  },
  selectTrigger: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectTriggerDisabled: {
    backgroundColor: '#f1f5f9',
  },
  selectTriggerText: {
    color: '#111827',
  },
  selectTriggerTextDisabled: {
    color: '#475569',
  },
  selectIndicator: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
  },
  selectMenu: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  selectOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  selectOptionLast: {
    borderBottomWidth: 0,
  },
  selectOptionSelected: {
    backgroundColor: '#eff6ff',
  },
  selectOptionText: {
    color: '#1f2937',
  },
  selectOptionTextSelected: {
    color: '#1d4ed8',
    fontWeight: '700',
  },
  readOnlyValue: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f1f5f9',
    color: '#0f172a',
  },
  helper: {
    marginTop: 4,
    color: '#64748b',
    fontSize: 12,
  },
  error: {
    color: '#b91c1c',
    marginBottom: 6,
  },
});

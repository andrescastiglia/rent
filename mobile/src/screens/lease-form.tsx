import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { currenciesApi } from '@/api/currencies';
import { interestedApi } from '@/api/interested';
import { leasesApi } from '@/api/leases';
import { ownersApi } from '@/api/owners';
import { propertiesApi } from '@/api/properties';
import { AppButton, Field } from '@/components/ui';
import { i18n } from '@/i18n';
import type {
  AdjustmentType,
  BillingFrequency,
  ContractType,
  CreateLeaseInput,
  InflationIndexType,
  LateFeeType,
  Lease,
  LeaseStatus,
  PaymentFrequency,
  UpdateLeaseInput,
} from '@/types/lease';
import type { InterestedProfile } from '@/types/interested';
import type { Owner } from '@/types/owner';
import type { Property } from '@/types/property';

const schema = z
  .object({
    propertyId: z.string().min(1, 'lease.property.required'),
    tenantId: z.string().optional(),
    buyerProfileId: z.string().optional(),
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
    paymentFrequency: z.enum(['monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual']).optional(),
    paymentDueDay: z.string().optional(),
    billingFrequency: z.enum(['first_of_month', 'last_of_month', 'contract_date', 'custom']).optional(),
    billingDay: z.string().optional(),
    autoGenerateInvoices: z.enum(['yes', 'no']).default('yes'),
    lateFeeType: z.enum(['none', 'fixed', 'percentage', 'daily_fixed', 'daily_percentage']).optional(),
    lateFeeValue: z.string().optional(),
    lateFeeGraceDays: z.string().optional(),
    lateFeeMax: z.string().optional(),
    adjustmentType: z.enum(['fixed', 'percentage', 'inflation_index']).optional(),
    adjustmentValue: z.string().optional(),
    adjustmentFrequencyMonths: z.string().optional(),
    inflationIndexType: z.enum(['icl', 'ipc', 'igp_m']).optional(),
    nextAdjustmentDate: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.contractType === 'rental') {
      if (!values.tenantId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tenantId'], message: 'lease.tenant.required' });
      }
      if (!values.startDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['startDate'], message: 'lease.startDate.required' });
      }
      if (!values.endDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'lease.endDate.required' });
      }
      if (!values.rentAmount) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rentAmount'], message: 'lease.rentAmount.required' });
      }
    }

    if (values.contractType === 'sale') {
      if (!values.buyerProfileId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['buyerProfileId'], message: 'lease.buyer.required' });
      }
      if (!values.fiscalValue) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fiscalValue'], message: 'lease.fiscalValue.required' });
      }
    }
  });

type FormValues = z.input<typeof schema>;

type LeaseFormProps = {
  mode: 'create' | 'edit';
  initial?: Lease;
  defaultPropertyId?: string;
  defaultOwnerId?: string;
  preselectedTenantId?: string;
  preselectedBuyerProfileId?: string;
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

function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = i18n.t('forms.selectOption'),
  disabled,
  helperText,
  testID,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((item) => item.value === value)?.label ?? (value || placeholder);

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
        <Text style={[styles.selectTriggerText, disabled && styles.selectTriggerTextDisabled]}>{selectedLabel || placeholder}</Text>
        {!disabled ? <Text style={styles.selectIndicator}>{open ? '▴' : '▾'}</Text> : null}
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
                style={[styles.selectOption, selected && styles.selectOptionSelected, isLast && styles.selectOptionLast]}
                testID={testID ? `${testID}.${option.value}` : undefined}
              >
                <Text style={[styles.selectOptionText, selected && styles.selectOptionTextSelected]}>{option.label}</Text>
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

const parseOps = (raw?: string | null): Array<'rent' | 'sale'> =>
  (raw ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is 'rent' | 'sale' => item === 'rent' || item === 'sale');

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
  const source = profile.operations?.length ? profile.operations : profile.operation ? [profile.operation] : [];
  return source.filter((item): item is 'rent' | 'sale' => item === 'rent' || item === 'sale');
};

const profileLabel = (profile: InterestedProfile): string =>
  `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() || profile.email || profile.phone;

const renderTemplateText = (
  templateBody: string,
  context: Record<string, string | undefined>,
): string => {
  return templateBody.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}|\{([a-zA-Z0-9_.]+)\}/g, (_full, keyA, keyB) => {
    const key = (keyA ?? keyB) as string;
    return context[key] ?? '';
  });
};

export function LeaseForm({
  mode,
  initial,
  defaultPropertyId,
  defaultOwnerId,
  preselectedTenantId,
  preselectedBuyerProfileId,
  preselectedPropertyOperations,
  preselectedPropertyName,
  preselectedOwnerName,
  preselectedContractType,
  submitting,
  onSubmit,
  submitLabel,
  testIDPrefix = 'leaseForm',
}: LeaseFormProps) {
  const { t } = useTranslation();
  const [datePickerTarget, setDatePickerTarget] = useState<'startDate' | 'endDate' | null>(null);
  const [datePickerValue, setDatePickerValue] = useState<Date>(new Date());
  const defaults: FormValues = useMemo(
    () => ({
      propertyId: initial?.propertyId ?? defaultPropertyId ?? '',
      tenantId: initial?.tenantId ?? preselectedTenantId ?? '',
      buyerProfileId: initial?.buyerProfileId ?? preselectedBuyerProfileId ?? '',
      ownerId: initial?.ownerId ?? defaultOwnerId ?? '',
      templateId: initial?.templateId ?? '',
      contractType: initial?.contractType ?? preselectedContractType ?? 'rental',
      status: initial?.status ?? 'DRAFT',
      startDate: initial?.startDate?.slice(0, 10) ?? '',
      endDate: initial?.endDate?.slice(0, 10) ?? '',
      rentAmount: initial?.rentAmount !== undefined ? String(initial.rentAmount) : '0',
      depositAmount: initial?.depositAmount !== undefined ? String(initial.depositAmount) : '0',
      fiscalValue: initial?.fiscalValue !== undefined ? String(initial.fiscalValue) : '',
      currency: initial?.currency ?? 'ARS',
      terms: initial?.terms ?? '',
      paymentFrequency: initial?.paymentFrequency ?? 'monthly',
      paymentDueDay: initial?.paymentDueDay !== undefined ? String(initial.paymentDueDay) : '',
      billingFrequency: initial?.billingFrequency ?? 'first_of_month',
      billingDay: initial?.billingDay !== undefined ? String(initial.billingDay) : '',
      autoGenerateInvoices: initial?.autoGenerateInvoices === false ? 'no' : 'yes',
      lateFeeType: initial?.lateFeeType ?? 'none',
      lateFeeValue: initial?.lateFeeValue !== undefined ? String(initial.lateFeeValue) : '',
      lateFeeGraceDays: initial?.lateFeeGraceDays !== undefined ? String(initial.lateFeeGraceDays) : '',
      lateFeeMax: initial?.lateFeeMax !== undefined ? String(initial.lateFeeMax) : '',
      adjustmentType: initial?.adjustmentType ?? 'fixed',
      adjustmentValue: initial?.adjustmentValue !== undefined ? String(initial.adjustmentValue) : '',
      adjustmentFrequencyMonths:
        initial?.adjustmentFrequencyMonths !== undefined ? String(initial.adjustmentFrequencyMonths) : '',
      inflationIndexType: initial?.inflationIndexType ?? 'icl',
      nextAdjustmentDate: initial?.nextAdjustmentDate?.slice(0, 10) ?? '',
    }),
    [
      defaultOwnerId,
      defaultPropertyId,
      initial,
      preselectedBuyerProfileId,
      preselectedContractType,
      preselectedTenantId,
    ],
  );

  const { control, watch, setValue, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  const propertiesQuery = useQuery({ queryKey: ['properties'], queryFn: propertiesApi.getAll });
  const interestedQuery = useQuery({ queryKey: ['interested'], queryFn: interestedApi.getAll });
  const ownersQuery = useQuery({ queryKey: ['owners'], queryFn: ownersApi.getAll });
  const templatesQuery = useQuery({ queryKey: ['leases', 'templates'], queryFn: () => leasesApi.getTemplates() });
  const currenciesQuery = useQuery({ queryKey: ['currencies'], queryFn: currenciesApi.getAll });

  const values = watch();
  const contractType = values.contractType ?? 'rental';
  const hasPreselectedProperty = mode === 'create' && Boolean(defaultPropertyId);
  const hasPreselectedTenant = mode === 'create' && Boolean(preselectedTenantId);
  const hasPreselectedBuyer = mode === 'create' && Boolean(preselectedBuyerProfileId);
  const shouldLockContractTypeByInterested = mode === 'create' && (hasPreselectedTenant || hasPreselectedBuyer);

  const selectedProperty = useMemo(
    () => (propertiesQuery.data ?? []).find((item) => item.id === values.propertyId),
    [propertiesQuery.data, values.propertyId],
  );

  const selectedPropertyOps = useMemo(() => {
    const fromProperty = selectedProperty?.operations?.length ? selectedProperty.operations : [];
    if (fromProperty.length > 0) {
      return fromProperty;
    }
    return parseOps(preselectedPropertyOperations);
  }, [preselectedPropertyOperations, selectedProperty]);

  const selectedPropertySupportsRent = selectedPropertyOps.includes('rent');
  const selectedPropertySupportsSale = selectedPropertyOps.includes('sale');

  const shouldShowContractTypeSelect =
    !shouldLockContractTypeByInterested && selectedPropertySupportsRent && selectedPropertySupportsSale;

  const propertyOptions = useMemo(() => {
    const base = (propertiesQuery.data ?? []).filter((property) => {
      if (!shouldLockContractTypeByInterested) {
        return true;
      }
      const requiredOp = hasPreselectedBuyer ? 'sale' : 'rent';
      const ops = property.operations ?? [];
      return ops.length === 0 || ops.includes(requiredOp);
    });

    if (selectedProperty && !base.some((item) => item.id === selectedProperty.id)) {
      return [selectedProperty, ...base];
    }

    return base;
  }, [hasPreselectedBuyer, selectedProperty, shouldLockContractTypeByInterested, propertiesQuery.data]);

  const selectedOwner = useMemo(
    () => (ownersQuery.data ?? []).find((item) => item.id === values.ownerId),
    [ownersQuery.data, values.ownerId],
  );

  const interestedProfiles = interestedQuery.data?.data ?? [];

  const tenantOptions = useMemo(() => {
    const source = interestedProfiles
      .filter((profile) => Boolean(profile.convertedToTenantId) && profileOps(profile).includes('rent'))
      .map((profile) => ({ value: profile.convertedToTenantId as string, label: profileLabel(profile) }));
    return source.filter((option, index) => source.findIndex((item) => item.value === option.value) === index);
  }, [interestedProfiles]);

  const buyerOptions = useMemo(
    () =>
      interestedProfiles
        .filter((profile) => profileOps(profile).includes('sale'))
        .map((profile) => ({ value: profile.id, label: profileLabel(profile) })),
    [interestedProfiles],
  );

  const templatesForType = useMemo(
    () => (templatesQuery.data ?? []).filter((item) => item.contractType === contractType),
    [contractType, templatesQuery.data],
  );
  const singleTemplate = templatesForType.length === 1 ? templatesForType[0] : null;

  const selectedTemplate = useMemo(
    () => (templatesQuery.data ?? []).find((item) => item.id === values.templateId),
    [templatesQuery.data, values.templateId],
  );

  useEffect(() => {
    if (mode !== 'create') return;
    if (defaultPropertyId) {
      setValue('propertyId', defaultPropertyId, { shouldValidate: true });
    }
    if (preselectedTenantId) {
      setValue('tenantId', preselectedTenantId, { shouldValidate: true });
      setValue('contractType', 'rental', { shouldValidate: true });
    }
    if (preselectedBuyerProfileId) {
      setValue('buyerProfileId', preselectedBuyerProfileId, { shouldValidate: true });
      setValue('contractType', 'sale', { shouldValidate: true });
    }
  }, [defaultPropertyId, mode, preselectedBuyerProfileId, preselectedTenantId, setValue]);

  useEffect(() => {
    if (!selectedProperty?.ownerId) return;
    if (values.ownerId === selectedProperty.ownerId) return;
    setValue('ownerId', selectedProperty.ownerId, { shouldValidate: true });
  }, [selectedProperty, setValue, values.ownerId]);

  useEffect(() => {
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
      setValue('buyerProfileId', '', { shouldValidate: true });
      return;
    }

    if (!selectedPropertySupportsRent && selectedPropertySupportsSale) {
      setValue('contractType', 'sale', { shouldValidate: true });
      setValue('tenantId', '', { shouldValidate: true });
      return;
    }
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
    if (singleTemplate) {
      if (values.templateId !== singleTemplate.id) {
        setValue('templateId', singleTemplate.id, { shouldValidate: true });
      }
      return;
    }

    if (mode !== 'edit') {
      const valid = templatesForType.some((template) => template.id === values.templateId);
      if (!valid && templatesForType[0]) {
        setValue('templateId', templatesForType[0].id, { shouldValidate: true });
      }
    }
  }, [mode, setValue, singleTemplate, templatesForType, values.templateId]);

  useEffect(() => {
    if (!selectedTemplate) {
      return;
    }

    const ownerName = selectedOwner
      ? `${selectedOwner.firstName ?? ''} ${selectedOwner.lastName ?? ''}`.trim()
      : preselectedOwnerName ?? '';
    const tenantName = tenantOptions.find((item) => item.value === values.tenantId)?.label ?? '';
    const buyerName = buyerOptions.find((item) => item.value === values.buyerProfileId)?.label ?? '';

    const rendered = renderTemplateText(selectedTemplate.templateBody, {
      'property.name': selectedProperty?.name ?? preselectedPropertyName,
      'owner.fullName': ownerName,
      'tenant.fullName': tenantName,
      'buyer.fullName': buyerName,
    });

    if ((values.terms ?? '').trim() !== rendered.trim()) {
      setValue('terms', rendered, { shouldValidate: true, shouldDirty: true });
    }
  }, [
    buyerOptions,
    preselectedOwnerName,
    preselectedPropertyName,
    selectedOwner,
    selectedProperty?.name,
    selectedTemplate,
    setValue,
    tenantOptions,
    values.buyerProfileId,
    values.tenantId,
    values.terms,
  ]);

  const currencyOptions: SelectOption[] = useMemo(() => {
    const fromApi = (currenciesQuery.data ?? []).map((item) => ({ value: item.code, label: item.code }));
    if (fromApi.length === 0) {
      return [{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }];
    }
    if (values.currency && !fromApi.some((item) => item.value === values.currency)) {
      return [{ value: values.currency, label: values.currency }, ...fromApi];
    }
    return fromApi;
  }, [currenciesQuery.data, values.currency]);

  const ownerDisplay = selectedOwner
    ? `${selectedOwner.firstName ?? ''} ${selectedOwner.lastName ?? ''}`.trim() || selectedOwner.email
    : preselectedOwnerName || '-';
  const propertyDisplay = selectedProperty?.name || preselectedPropertyName || '-';

  const submit = handleSubmit(async (data) => {
    const payload: CreateLeaseInput = {
      propertyId: data.propertyId,
      tenantId: data.contractType === 'rental' ? data.tenantId || undefined : undefined,
      buyerProfileId: data.contractType === 'sale' ? data.buyerProfileId || undefined : undefined,
      ownerId: selectedProperty?.ownerId ?? data.ownerId,
      templateId: data.templateId || undefined,
      contractType: data.contractType,
      status: data.status,
      startDate: data.contractType === 'rental' ? data.startDate || undefined : undefined,
      endDate: data.contractType === 'rental' ? data.endDate || undefined : undefined,
      rentAmount: data.contractType === 'rental' ? toNumberOrUndefined(data.rentAmount) : undefined,
      depositAmount: Number(data.depositAmount),
      fiscalValue: data.contractType === 'sale' ? toNumberOrUndefined(data.fiscalValue) : undefined,
      currency: data.currency,
      terms: data.terms || undefined,
      paymentFrequency: data.contractType === 'rental' ? data.paymentFrequency || undefined : undefined,
      paymentDueDay: data.contractType === 'rental' ? toNumberOrUndefined(data.paymentDueDay) : undefined,
      billingFrequency: data.contractType === 'rental' ? data.billingFrequency || undefined : undefined,
      billingDay: data.contractType === 'rental' ? toNumberOrUndefined(data.billingDay) : undefined,
      autoGenerateInvoices: data.contractType === 'rental' ? data.autoGenerateInvoices === 'yes' : undefined,
      lateFeeType: data.contractType === 'rental' ? data.lateFeeType || undefined : undefined,
      lateFeeValue:
        data.contractType === 'rental' && data.lateFeeType && data.lateFeeType !== 'none'
          ? toNumberOrUndefined(data.lateFeeValue)
          : undefined,
      lateFeeGraceDays:
        data.contractType === 'rental' && data.lateFeeType && data.lateFeeType !== 'none'
          ? toNumberOrUndefined(data.lateFeeGraceDays)
          : undefined,
      lateFeeMax:
        data.contractType === 'rental' && data.lateFeeType && data.lateFeeType !== 'none'
          ? toNumberOrUndefined(data.lateFeeMax)
          : undefined,
      adjustmentType: data.contractType === 'rental' ? data.adjustmentType || undefined : undefined,
      adjustmentValue:
        data.contractType === 'rental' && data.adjustmentType && data.adjustmentType !== 'fixed'
          ? toNumberOrUndefined(data.adjustmentValue)
          : undefined,
      adjustmentFrequencyMonths:
        data.contractType === 'rental' && data.adjustmentType && data.adjustmentType !== 'fixed'
          ? toNumberOrUndefined(data.adjustmentFrequencyMonths)
          : undefined,
      inflationIndexType:
        data.contractType === 'rental' && data.adjustmentType === 'inflation_index'
          ? data.inflationIndexType || undefined
          : undefined,
      nextAdjustmentDate:
        data.contractType === 'rental' && data.adjustmentType && data.adjustmentType !== 'fixed'
          ? data.nextAdjustmentDate || undefined
          : undefined,
      documents: initial?.documents ?? [],
    };

    await onSubmit(payload);
  });

  const handleOpenDatePicker = (target: 'startDate' | 'endDate') => {
    const current = target === 'startDate' ? values.startDate : values.endDate;
    setDatePickerValue(parseDateOrToday(current));
    setDatePickerTarget(target);
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setDatePickerTarget(null);
    }
    if (event.type === 'dismissed' || !selectedDate || !datePickerTarget) {
      return;
    }

    const next = toDateString(selectedDate);
    setValue(datePickerTarget, next, { shouldValidate: true, shouldDirty: true });

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
      default:
        return message;
    }
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>{t('leases.leaseDetails')}</Text>
      {hasPreselectedProperty ? (
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>{t('leases.fields.property')}</Text>
          <Text style={styles.readOnlyValue}>{propertyDisplay}</Text>
          <Text style={styles.helper}>{t('leases.prefilledFieldHint')}</Text>
        </View>
      ) : (
        <Controller
          control={control}
          name="propertyId"
          render={({ field }) => (
            <SelectField
              label={t('leases.fields.property')}
              value={field.value}
              onChange={field.onChange}
              options={propertyOptions.map((item) => ({ value: item.id, label: item.name }))}
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
            options={contractTypeOptions.map((option) => ({ value: option.value, label: t(`leases.contractTypes.${option.value}`) }))}
            disabled={!shouldShowContractTypeSelect}
            helperText={
              shouldLockContractTypeByInterested
                ? t('leases.contractTypeFixedByInterested')
                : !shouldShowContractTypeSelect
                  ? t('leases.contractTypeFixedByProperty')
                  : undefined
            }
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
            options={templatesForType.map((item) => ({ value: item.id, label: item.name }))}
            placeholder={t('leases.templates.none')}
            disabled={Boolean(singleTemplate)}
            helperText={singleTemplate ? t('leases.templateLockedHint') : t('leases.templateAutofillHint')}
            testID={`${testIDPrefix}.templateId`}
          />
        )}
      />

      <View style={styles.fieldContainer}>
        <Text style={styles.fieldLabel}>{t('leases.fields.owner')}</Text>
        <Text style={styles.readOnlyValue}>{ownerDisplay}</Text>
        <Text style={styles.helper}>{t('leases.ownerFromPropertyHint')}</Text>
      </View>

      <Controller
        control={control}
        name="status"
        render={({ field }) => (
          <SelectField
            label={t('leases.fields.status')}
            value={field.value}
            onChange={field.onChange}
            options={statusOptions.map((option) => ({ value: option.value, label: t(`leases.status.${option.value}`) }))}
            testID={`${testIDPrefix}.status`}
          />
        )}
      />

      {contractType === 'rental' ? (
        <>
          {hasPreselectedTenant ? (
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>{t('leases.fields.tenant')}</Text>
              <Text style={styles.readOnlyValue}>{tenantOptions.find((item) => item.value === values.tenantId)?.label ?? preselectedTenantId}</Text>
              <Text style={styles.helper}>{t('leases.prefilledFieldHint')}</Text>
            </View>
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
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>{t('leases.startDate')}</Text>
                <Pressable
                  onPress={() => handleOpenDatePicker('startDate')}
                  style={styles.selectTrigger}
                  testID={`${testIDPrefix}.startDate`}
                >
                  <Text style={styles.selectTriggerText}>{field.value || t('leases.startDate')}</Text>
                  <Text style={styles.selectIndicator}>▾</Text>
                </Pressable>
              </View>
            )}
          />
          <Controller
            control={control}
            name="endDate"
            render={({ field }) => (
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>{t('leases.endDate')}</Text>
                <Pressable
                  onPress={() => handleOpenDatePicker('endDate')}
                  style={styles.selectTrigger}
                  testID={`${testIDPrefix}.endDate`}
                >
                  <Text style={styles.selectTriggerText}>{field.value || t('leases.endDate')}</Text>
                  <Text style={styles.selectIndicator}>▾</Text>
                </Pressable>
              </View>
            )}
          />
        </>
      ) : (
        <>
          {hasPreselectedBuyer ? (
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>{t('leases.fields.buyer')}</Text>
              <Text style={styles.readOnlyValue}>{buyerOptions.find((item) => item.value === values.buyerProfileId)?.label ?? preselectedBuyerProfileId}</Text>
              <Text style={styles.helper}>{t('leases.prefilledFieldHint')}</Text>
            </View>
          ) : (
            <Controller
              control={control}
              name="buyerProfileId"
              render={({ field }) => (
                <SelectField
                  label={t('leases.fields.buyer')}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  options={buyerOptions}
                  placeholder={t('leases.selectBuyer')}
                  testID={`${testIDPrefix}.buyerProfileId`}
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

      {contractType === 'rental' ? (
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
                options={paymentFrequencyOptions.map((option) => ({ value: option.value, label: t(`leases.paymentFrequencies.${option.value}`) }))}
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
                options={billingFrequencyOptions.map((option) => ({ value: option.value, label: t(`leases.billingFrequencies.${option.value}`) }))}
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
                options={autoGenerateOptions.map((option) => ({ value: option.value, label: option.value === 'yes' ? t('common.yes') : t('common.no') }))}
                testID={`${testIDPrefix}.autoGenerateInvoices`}
              />
            )}
          />

          <Text style={styles.sectionTitle}>{t('leases.lateFees.title')}</Text>
          <Controller
            control={control}
            name="lateFeeType"
            render={({ field }) => (
              <SelectField
                label={t('leases.fields.lateFeeType')}
                value={field.value ?? 'none'}
                onChange={field.onChange}
                options={lateFeeTypeOptions.map((option) => ({ value: option.value, label: t(`leases.lateFeeTypes.${option.value}`) }))}
                testID={`${testIDPrefix}.lateFeeType`}
              />
            )}
          />
          {(values.lateFeeType ?? 'none') !== 'none' ? (
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
                options={adjustmentTypeOptions.map((option) => ({ value: option.value, label: t(`leases.adjustmentTypes.${option.value}`) }))}
                testID={`${testIDPrefix}.adjustmentType`}
              />
            )}
          />

          {(values.adjustmentType ?? 'fixed') !== 'fixed' ? (
            <>
              {(values.adjustmentType ?? 'fixed') === 'percentage' ? (
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

              {(values.adjustmentType ?? 'fixed') === 'inflation_index' ? (
                <Controller
                  control={control}
                  name="inflationIndexType"
                  render={({ field }) => (
                    <SelectField
                      label={t('leases.fields.inflationIndexType')}
                      value={field.value ?? 'icl'}
                      onChange={field.onChange}
                      options={inflationIndexOptions.map((option) => ({ value: option.value, label: t(`leases.inflationIndexTypes.${option.value}`) }))}
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
      ) : null}

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

      {Object.values(formState.errors).map((item) => {
        if (!item?.message) return null;
        const message = resolveErrorMessage(item.message);
        return (
          <Text key={`${item.message}-${message}`} style={styles.error}>
            {message}
          </Text>
        );
      })}

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

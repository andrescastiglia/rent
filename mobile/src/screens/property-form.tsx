import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { currenciesApi } from '@/api/currencies';
import { ownersApi } from '@/api/owners';
import { pickAndUploadImages } from '@/api/uploads';
import { AppButton, ChoiceGroup, Field } from '@/components/ui';
import type {
  CreatePropertyInput,
  Property,
  PropertyOperation,
  PropertyOperationState,
  PropertyStatus,
  PropertyType,
  UpdatePropertyInput,
} from '@/types/property';

const schema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  type: z.enum(['APARTMENT', 'HOUSE', 'COMMERCIAL', 'OFFICE', 'WAREHOUSE', 'LAND', 'PARKING', 'OTHER']),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE']),
  ownerId: z.string().min(1),
  ownerWhatsapp: z.string().optional(),
  street: z.string().min(1),
  number: z.string().min(1),
  unit: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  zipCode: z.string().min(1),
  country: z.string().min(1),
  operationsCsv: z.string().min(1, 'property.operations.required'),
  operationState: z.enum(['available', 'rented', 'reserved', 'sold']).optional(),
  allowsPets: z.enum(['unspecified', 'yes', 'no']).default('yes'),
  acceptedGuaranteeTypesCsv: z.string().optional(),
  maxOccupants: z.string().optional(),
  rentPrice: z.string().optional(),
  salePrice: z.string().optional(),
  saleCurrency: z.string().optional(),
});

type FormValues = z.input<typeof schema>;

type PropertyFormProps = {
  mode: 'create' | 'edit';
  initial?: Property;
  defaultOwnerId?: string;
  submitting?: boolean;
  onSubmit: (payload: CreatePropertyInput | UpdatePropertyInput) => Promise<void>;
  submitLabel: string;
  testIDPrefix?: string;
};

const typeOptions: Array<{ label: string; value: PropertyType }> = [
  { label: 'Depto', value: 'APARTMENT' },
  { label: 'Casa', value: 'HOUSE' },
  { label: 'Comercial', value: 'COMMERCIAL' },
  { label: 'Oficina', value: 'OFFICE' },
  { label: 'Deposito', value: 'WAREHOUSE' },
  { label: 'Terreno', value: 'LAND' },
  { label: 'Cochera', value: 'PARKING' },
  { label: 'Otro', value: 'OTHER' },
];

const statusOptions: Array<{ label: string; value: PropertyStatus }> = [
  { label: 'Activa', value: 'ACTIVE' },
  { label: 'Inactiva', value: 'INACTIVE' },
  { label: 'Mantenimiento', value: 'MAINTENANCE' },
];

const operationStateOptions: Array<{ label: string; value: PropertyOperationState }> = [
  { label: 'Disponible', value: 'available' },
  { label: 'Alquilada', value: 'rented' },
  { label: 'Reservada', value: 'reserved' },
  { label: 'Vendida', value: 'sold' },
];

const allowsPetsOptions = [
  { label: 'Sin definir', value: 'unspecified' as const },
  { label: 'Si', value: 'yes' as const },
  { label: 'No', value: 'no' as const },
];

const splitCsv = (value?: string): string[] =>
  (value ?? '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

const parseOperations = (value?: string): PropertyOperation[] =>
  splitCsv(value).filter((item): item is PropertyOperation => item === 'rent' || item === 'sale');

export function PropertyForm({
  mode,
  initial,
  defaultOwnerId,
  submitting,
  onSubmit,
  submitLabel,
  testIDPrefix = 'propertyForm',
}: PropertyFormProps) {
  const { t } = useTranslation();
  const [uploadingImages, setUploadingImages] = useState(false);
  const [showCurrencyOptions, setShowCurrencyOptions] = useState(false);
  const isOwnerLocked = mode === 'edit' || Boolean(defaultOwnerId);
  const initialFeatureRows = useMemo(
    () => (initial?.features ?? []).map((item) => ({ name: item.name ?? '', value: item.value ?? '' })),
    [initial],
  );
  const initialImageUrls = useMemo(() => initial?.images ?? [], [initial]);
  const [featureRows, setFeatureRows] = useState<Array<{ name: string; value: string }>>(initialFeatureRows);
  const [imageUrls, setImageUrls] = useState<string[]>(initialImageUrls);

  const defaults: FormValues = useMemo(
    () => ({
      name: initial?.name ?? '',
      description: initial?.description ?? '',
      type: initial?.type ?? 'APARTMENT',
      status: initial?.status ?? 'ACTIVE',
      ownerId: initial?.ownerId ?? defaultOwnerId ?? '',
      ownerWhatsapp: initial?.ownerWhatsapp ?? '',
      street: initial?.address.street ?? '',
      number: initial?.address.number ?? '',
      unit: initial?.address.unit ?? '',
      city: initial?.address.city ?? '',
      state: initial?.address.state ?? '',
      zipCode: initial?.address.zipCode ?? '',
      country: initial?.address.country ?? 'Argentina',
      operationsCsv: initial?.operations?.join(', ') ?? 'rent',
      operationState: initial?.operationState ?? 'available',
      allowsPets: initial?.allowsPets === undefined ? 'yes' : initial.allowsPets ? 'yes' : 'no',
      acceptedGuaranteeTypesCsv: initial?.acceptedGuaranteeTypes?.join(', ') ?? '',
      maxOccupants: initial?.maxOccupants?.toString() ?? '',
      rentPrice: initial?.rentPrice?.toString() ?? '',
      salePrice: initial?.salePrice?.toString() ?? '',
      saleCurrency: initial?.saleCurrency ?? 'ARS',
    }),
    [defaultOwnerId, initial],
  );

  const { control, getValues, handleSubmit, formState, setValue, watch, clearErrors } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  const ownersQuery = useQuery({
    queryKey: ['owners'],
    queryFn: ownersApi.getAll,
  });
  const currenciesQuery = useQuery({
    queryKey: ['currencies'],
    queryFn: currenciesApi.getAll,
  });

  const ownerIdFromForm = watch('ownerId');
  const saleCurrencyValue = watch('saleCurrency');
  const activeOwnerId = mode === 'edit' ? initial?.ownerId ?? ownerIdFromForm : defaultOwnerId ?? ownerIdFromForm;
  const activeOwner = useMemo(
    () => (ownersQuery.data ?? []).find((owner) => owner.id === activeOwnerId),
    [activeOwnerId, ownersQuery.data],
  );

  const selectedOperations = parseOperations(watch('operationsCsv'));
  const isRentOperationSelected = selectedOperations.includes('rent');
  const isSaleOperationSelected = selectedOperations.includes('sale');
  const currencyOptions = useMemo(() => {
    const apiCodes = (currenciesQuery.data ?? []).map((item) => item.code);
    const base = apiCodes.length > 0 ? apiCodes : ['ARS'];
    return saleCurrencyValue && !base.includes(saleCurrencyValue) ? [saleCurrencyValue, ...base] : base;
  }, [currenciesQuery.data, saleCurrencyValue]);

  useEffect(() => {
    setFeatureRows(initialFeatureRows);
  }, [initialFeatureRows]);

  useEffect(() => {
    setImageUrls(initialImageUrls);
  }, [initialImageUrls]);

  useEffect(() => {
    if (mode === 'edit') {
      return;
    }
    if (!defaultOwnerId) {
      return;
    }
    setValue('ownerId', defaultOwnerId, { shouldValidate: true });
  }, [defaultOwnerId, mode, setValue]);

  useEffect(() => {
    if (!isOwnerLocked || !activeOwner) {
      return;
    }

    setValue('ownerWhatsapp', activeOwner.phone ?? '', { shouldValidate: true });
  }, [activeOwner, isOwnerLocked, setValue]);

  useEffect(() => {
    if (isRentOperationSelected) {
      return;
    }
    setValue('rentPrice', '', { shouldValidate: true });
    clearErrors('rentPrice');
  }, [clearErrors, isRentOperationSelected, setValue]);

  useEffect(() => {
    if (isSaleOperationSelected) {
      return;
    }
    setValue('salePrice', '', { shouldValidate: true });
    clearErrors('salePrice');
  }, [clearErrors, isSaleOperationSelected, setValue]);

  const toggleOperation = (operation: PropertyOperation) => {
    const current = parseOperations(getValues('operationsCsv'));

    if (current.includes(operation) && current.length === 1) {
      return;
    }

    const next = current.includes(operation) ? current.filter((item) => item !== operation) : [...current, operation];
    setValue('operationsCsv', next.join(', '), { shouldValidate: true, shouldDirty: true });
  };

  const submit = handleSubmit(async (values) => {
    const operations = parseOperations(values.operationsCsv);
    if (operations.length === 0) {
      Alert.alert(t('common.error'), t('validation.required'));
      return;
    }

    const resolvedOwnerId = isOwnerLocked ? activeOwnerId : values.ownerId;
    if (!resolvedOwnerId) {
      Alert.alert(t('common.error'), t('validation.ownerRequired'));
      return;
    }

    const payloadBase = {
      name: values.name,
      description: values.description || undefined,
      type: values.type,
      ownerId: resolvedOwnerId,
      ownerWhatsapp: isOwnerLocked ? activeOwner?.phone || undefined : values.ownerWhatsapp || undefined,
      address: {
        street: values.street,
        number: values.number,
        unit: values.unit || undefined,
        city: values.city,
        state: values.state,
        zipCode: values.zipCode,
        country: values.country,
      },
      operations,
      operationState: mode === 'edit' ? values.operationState || undefined : undefined,
      allowsPets:
        values.allowsPets === 'unspecified'
          ? undefined
          : values.allowsPets === 'yes',
      acceptedGuaranteeTypes: splitCsv(values.acceptedGuaranteeTypesCsv),
      maxOccupants: values.maxOccupants ? Number(values.maxOccupants) : undefined,
      features: featureRows
        .map((item) => ({ name: item.name.trim(), value: item.value.trim() || undefined }))
        .filter((item) => item.name.length > 0),
      images: imageUrls.filter(Boolean),
      rentPrice: values.rentPrice ? Number(values.rentPrice) : undefined,
      salePrice: values.salePrice ? Number(values.salePrice) : undefined,
      saleCurrency: values.saleCurrency || undefined,
    } satisfies CreatePropertyInput;

    if (mode === 'edit') {
      await onSubmit({ ...payloadBase, status: values.status } satisfies UpdatePropertyInput);
      return;
    }

    await onSubmit(payloadBase);
  });

  return (
    <View>
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <Field label={t('properties.fields.name')} value={field.value} onChangeText={field.onChange} testID={`${testIDPrefix}.name`} />
        )}
      />
      <Controller
        control={control}
        name="description"
        render={({ field }) => (
          <Field
            label={t('properties.fields.description')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            testID={`${testIDPrefix}.description`}
          />
        )}
      />
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
            <ChoiceGroup
              label={t('properties.fields.type')}
              value={field.value}
              onChange={field.onChange}
              options={typeOptions.map((option) => ({ value: option.value, label: t(`properties.types.${option.value}`) }))}
              testID={`${testIDPrefix}.type`}
            />
          )}
      />

      {mode === 'edit' ? (
        <Controller
          control={control}
          name="status"
          render={({ field }) => (
            <ChoiceGroup
              label={t('properties.fields.status')}
              value={field.value}
              onChange={field.onChange}
              options={statusOptions.map((option) => ({ value: option.value, label: t(`properties.status.${option.value}`) }))}
              testID={`${testIDPrefix}.status`}
            />
          )}
        />
      ) : null}

      <View style={styles.ownerBox}>
        <Text style={styles.ownerLabel}>{t('properties.fields.owner')}</Text>
        {isOwnerLocked ? (
          <Text style={styles.ownerValue}>{activeOwner ? `${activeOwner.firstName} ${activeOwner.lastName}`.trim() : activeOwnerId || '-'}</Text>
        ) : (
          <Controller
            control={control}
            name="ownerId"
            render={({ field }) => (
              <Field label={t('properties.fields.owner')} value={field.value} onChangeText={field.onChange} testID={`${testIDPrefix}.ownerId`} />
            )}
          />
        )}
      </View>

      <Controller
        control={control}
        name="ownerWhatsapp"
        render={({ field }) => (
          <Field
            label={t('properties.fields.ownerWhatsapp')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            editable={!isOwnerLocked}
            testID={`${testIDPrefix}.ownerWhatsapp`}
          />
        )}
      />
      <Controller
        control={control}
        name="street"
        render={({ field }) => <Field label={t('properties.fields.street')} value={field.value} onChangeText={field.onChange} testID={`${testIDPrefix}.street`} />}
      />
      <Controller
        control={control}
        name="number"
        render={({ field }) => <Field label={t('properties.fields.number')} value={field.value} onChangeText={field.onChange} testID={`${testIDPrefix}.number`} />}
      />
      <Controller
        control={control}
        name="unit"
        render={({ field }) => (
          <Field label={t('properties.fields.unit')} value={field.value ?? ''} onChangeText={field.onChange} testID={`${testIDPrefix}.unit`} />
        )}
      />
      <Controller
        control={control}
        name="city"
        render={({ field }) => <Field label={t('properties.fields.city')} value={field.value} onChangeText={field.onChange} testID={`${testIDPrefix}.city`} />}
      />
      <Controller
        control={control}
        name="state"
        render={({ field }) => <Field label={t('properties.fields.state')} value={field.value} onChangeText={field.onChange} testID={`${testIDPrefix}.state`} />}
      />
      <Controller
        control={control}
        name="zipCode"
        render={({ field }) => (
          <Field label={t('properties.fields.zipCode')} value={field.value} onChangeText={field.onChange} testID={`${testIDPrefix}.zipCode`} />
        )}
      />
      <Controller
        control={control}
        name="country"
        render={({ field }) => <Field label={t('properties.fields.country')} value={field.value} onChangeText={field.onChange} testID={`${testIDPrefix}.country`} />}
      />

      <View style={styles.operationsBlock}>
        <Text style={styles.operationsLabel}>{t('properties.fields.operations')}</Text>
        <View style={styles.operationsRow}>
          <Pressable
            onPress={() => toggleOperation('rent')}
            style={[styles.operationChip, isRentOperationSelected && styles.operationChipSelected]}
            testID={`${testIDPrefix}.operations.rent`}
          >
            <Text style={[styles.operationChipText, isRentOperationSelected && styles.operationChipTextSelected]}>{t('properties.operations.rent')}</Text>
          </Pressable>
          <Pressable
            onPress={() => toggleOperation('sale')}
            style={[styles.operationChip, isSaleOperationSelected && styles.operationChipSelected]}
            testID={`${testIDPrefix}.operations.sale`}
          >
            <Text style={[styles.operationChipText, isSaleOperationSelected && styles.operationChipTextSelected]}>{t('properties.operations.sale')}</Text>
          </Pressable>
        </View>
      </View>

      {mode === 'edit' ? (
        <Controller
          control={control}
          name="operationState"
          render={({ field }) => (
            <ChoiceGroup
              label={t('properties.fields.operationState')}
              value={field.value ?? 'available'}
              onChange={field.onChange}
              options={operationStateOptions.map((option) => ({ value: option.value, label: t(`properties.operationState.${option.value}`) }))}
              testID={`${testIDPrefix}.operationState`}
            />
          )}
        />
      ) : null}

      <Controller
        control={control}
        name="allowsPets"
        render={({ field }) => (
            <ChoiceGroup
            label={t('properties.fields.allowsPets')}
            value={field.value ?? 'yes'}
            onChange={field.onChange}
            options={allowsPetsOptions.map((option) => ({ value: option.value, label: option.value === 'yes' ? t('common.yes') : option.value === 'no' ? t('common.no') : '-' }))}
            testID={`${testIDPrefix}.allowsPets`}
          />
        )}
      />
      <Controller
        control={control}
        name="acceptedGuaranteeTypesCsv"
        render={({ field }) => (
          <Field
            label={t('properties.fields.acceptedGuaranteeTypes')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            testID={`${testIDPrefix}.acceptedGuarantees`}
          />
        )}
      />
      <Controller
        control={control}
        name="maxOccupants"
        render={({ field }) => (
          <Field
            label={t('properties.fields.maxOccupants')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            keyboardType="numeric"
            testID={`${testIDPrefix}.maxOccupants`}
          />
        )}
      />

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('properties.features')}</Text>
          <Pressable
            onPress={() => setFeatureRows((current) => [...current, { name: '', value: '' }])}
            style={styles.inlineAction}
            testID={`${testIDPrefix}.features.add`}
          >
            <Text style={styles.inlineActionText}>{t('properties.addFeature')}</Text>
          </Pressable>
        </View>

        {featureRows.length === 0 ? <Text style={styles.muted}>{t('properties.noFeatures')}</Text> : null}
        {featureRows.map((row, index) => (
          <View key={`feature-${index}`} style={styles.featureRow}>
            <Field
              label={`Nombre #${index + 1}`}
              value={row.name}
              onChangeText={(next) =>
                setFeatureRows((current) =>
                  current.map((item, itemIndex) => (itemIndex === index ? { ...item, name: next } : item)),
                )
              }
              testID={`${testIDPrefix}.feature.${index}.name`}
            />
            <Field
              label={`Valor #${index + 1}`}
              value={row.value}
              onChangeText={(next) =>
                setFeatureRows((current) =>
                  current.map((item, itemIndex) => (itemIndex === index ? { ...item, value: next } : item)),
                )
              }
              testID={`${testIDPrefix}.feature.${index}.value`}
            />
            <Pressable
              onPress={() => setFeatureRows((current) => current.filter((_, itemIndex) => itemIndex !== index))}
              style={styles.removeAction}
              testID={`${testIDPrefix}.feature.${index}.remove`}
            >
              <Text style={styles.removeActionText}>{t('common.delete')}</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{t('properties.fields.images')}</Text>
        <AppButton
          title={t('forms.uploadImage')}
          variant="secondary"
          loading={uploadingImages}
          testID={`${testIDPrefix}.upload`}
          onPress={() => {
            setUploadingImages(true);
            void pickAndUploadImages()
              .then((uploaded) => {
                if (uploaded.length === 0) return;
                setImageUrls((current) => Array.from(new Set([...current, ...uploaded.map((item) => item.url)])));
              })
              .catch((error) => {
                Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.saveError'));
              })
              .finally(() => setUploadingImages(false));
          }}
        />
        {imageUrls.length === 0 ? <Text style={styles.muted}>{t('common.noDataAvailable')}</Text> : null}
        <View style={styles.imageGrid}>
          {imageUrls.map((uri, index) => (
            <View key={`${uri}-${index}`} style={styles.imageCard}>
              <Image source={{ uri }} style={styles.imagePreview} />
              <Pressable
                onPress={() => setImageUrls((current) => current.filter((_, imageIndex) => imageIndex !== index))}
                style={styles.removeImageButton}
                testID={`${testIDPrefix}.image.${index}.remove`}
              >
                <Text style={styles.removeImageButtonText}>{t('common.delete')}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </View>

      <Controller
        control={control}
        name="rentPrice"
        render={({ field }) => (
          <Field
            label={t('properties.fields.rentPrice')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            editable={isRentOperationSelected}
            keyboardType="numeric"
            testID={`${testIDPrefix}.rentPrice`}
          />
        )}
      />
      <Controller
        control={control}
        name="salePrice"
        render={({ field }) => (
          <Field
            label={t('properties.fields.salePrice')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            editable={isSaleOperationSelected}
            keyboardType="numeric"
            testID={`${testIDPrefix}.salePrice`}
          />
        )}
      />
      <Controller
        control={control}
        name="saleCurrency"
        render={({ field }) => (
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{t('properties.fields.saleCurrency')}</Text>
            <Pressable
              onPress={() => setShowCurrencyOptions((current) => !current)}
              style={styles.selectTrigger}
              testID={`${testIDPrefix}.saleCurrency`}
            >
              <Text style={styles.selectTriggerText}>{field.value || 'ARS'}</Text>
              <Text style={styles.selectIndicator}>{showCurrencyOptions ? '▴' : '▾'}</Text>
            </Pressable>
            {showCurrencyOptions ? (
              <View style={styles.selectMenu}>
                {currencyOptions.map((currencyCode, index) => {
                  const selected = currencyCode === field.value;
                  const isLast = index === currencyOptions.length - 1;
                  return (
                    <Pressable
                      key={currencyCode}
                      onPress={() => {
                        field.onChange(currencyCode);
                        setShowCurrencyOptions(false);
                      }}
                      style={[styles.selectOption, selected && styles.selectOptionSelected, isLast && styles.selectOptionLast]}
                      testID={`${testIDPrefix}.saleCurrency.${currencyCode}`}
                    >
                      <Text style={[styles.selectOptionText, selected && styles.selectOptionTextSelected]}>
                        {currencyCode}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        )}
      />

      {Object.values(formState.errors).map((item) => {
        if (!item?.message) return null;
        const message = item.message === 'property.operations.required' ? t('validation.required') : item.message;
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
    </View>
  );
}

const styles = StyleSheet.create({
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
  selectTriggerText: {
    color: '#111827',
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
  ownerBox: {
    marginBottom: 16,
  },
  ownerLabel: {
    marginBottom: 8,
    color: '#1f2937',
    fontWeight: '600',
  },
  ownerValue: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f1f5f9',
    color: '#0f172a',
  },
  operationsBlock: {
    marginBottom: 16,
  },
  operationsLabel: {
    marginBottom: 8,
    color: '#1f2937',
    fontWeight: '600',
  },
  operationsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  operationChip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  operationChipSelected: {
    borderColor: '#1d4ed8',
    backgroundColor: '#dbeafe',
  },
  operationChipText: {
    color: '#1f2937',
    fontWeight: '600',
  },
  operationChipTextSelected: {
    color: '#1e40af',
  },
  sectionBlock: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    color: '#0f172a',
    fontWeight: '700',
    marginBottom: 8,
  },
  inlineAction: {
    borderWidth: 1,
    borderColor: '#93c5fd',
    borderRadius: 999,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  inlineActionText: {
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: 12,
  },
  muted: {
    color: '#64748b',
    marginTop: 4,
  },
  featureRow: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    backgroundColor: '#fff',
  },
  removeAction: {
    alignSelf: 'flex-end',
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 999,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  removeActionText: {
    color: '#b91c1c',
    fontWeight: '700',
    fontSize: 12,
  },
  imageGrid: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  imageCard: {
    width: 110,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 6,
    backgroundColor: '#fff',
    gap: 6,
  },
  imagePreview: {
    width: '100%',
    height: 80,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  removeImageButton: {
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 999,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
  },
  removeImageButtonText: {
    color: '#b91c1c',
    fontWeight: '700',
    fontSize: 11,
  },
  error: {
    color: '#b91c1c',
    marginBottom: 6,
  },
});

import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { AppButton, ChoiceGroup, Field } from '@/components/ui';
import type {
  CreateTenantInput,
  EmploymentStatus,
  Tenant,
  TenantStatus,
  UpdateTenantInput,
} from '@/types/tenant';

const schema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(6),
  dni: z.string().min(6),
  cuil: z.string().optional(),
  dateOfBirth: z.string().optional(),
  nationality: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PROSPECT']),
  addressStreet: z.string().optional(),
  addressNumber: z.string().optional(),
  addressCity: z.string().optional(),
  addressState: z.string().optional(),
  addressZipCode: z.string().optional(),
  occupation: z.string().optional(),
  employer: z.string().optional(),
  monthlyIncome: z.string().optional(),
  employmentStatus: z
    .enum(['employed', 'self_employed', 'unemployed', 'retired', 'student'])
    .optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
  creditScore: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type TenantFormProps = {
  mode: 'create' | 'edit';
  initial?: Tenant;
  submitting?: boolean;
  onSubmit: (payload: CreateTenantInput | UpdateTenantInput) => Promise<void>;
  submitLabel: string;
  testIDPrefix?: string;
};

const statusOptions: Array<{ label: string; value: TenantStatus }> = [
  { label: 'Activo', value: 'ACTIVE' },
  { label: 'Inactivo', value: 'INACTIVE' },
  { label: 'Prospecto', value: 'PROSPECT' },
];

const employmentStatusOptions: Array<{ label: string; value: EmploymentStatus }> = [
  { label: 'Empleado/a', value: 'employed' },
  { label: 'Autónomo/a', value: 'self_employed' },
  { label: 'Desempleado/a', value: 'unemployed' },
  { label: 'Jubilado/a', value: 'retired' },
  { label: 'Estudiante', value: 'student' },
];

export function TenantForm({
  initial,
  submitting,
  onSubmit,
  submitLabel,
  testIDPrefix = 'tenantForm',
}: TenantFormProps) {
  const { t } = useTranslation();

  const defaults: FormValues = useMemo(
    () => ({
      firstName: initial?.firstName ?? '',
      lastName: initial?.lastName ?? '',
      email: initial?.email ?? '',
      phone: initial?.phone ?? '',
      dni: initial?.dni ?? '',
      cuil: initial?.cuil ?? '',
      dateOfBirth: initial?.dateOfBirth?.slice(0, 10) ?? '',
      nationality: initial?.nationality ?? '',
      status: initial?.status ?? 'ACTIVE',
      addressStreet: initial?.address?.street ?? '',
      addressNumber: initial?.address?.number ?? '',
      addressCity: initial?.address?.city ?? '',
      addressState: initial?.address?.state ?? '',
      addressZipCode: initial?.address?.zipCode ?? '',
      occupation: initial?.occupation ?? '',
      employer: initial?.employer ?? '',
      monthlyIncome: initial?.monthlyIncome?.toString() ?? '',
      employmentStatus: initial?.employmentStatus,
      emergencyContactName: initial?.emergencyContactName ?? '',
      emergencyContactPhone: initial?.emergencyContactPhone ?? '',
      emergencyContactRelationship: initial?.emergencyContactRelationship ?? '',
      creditScore: initial?.creditScore?.toString() ?? '',
      notes: initial?.notes ?? '',
    }),
    [initial],
  );

  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  const submit = handleSubmit(async (values) => {
    const payload: CreateTenantInput = {
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      phone: values.phone,
      dni: values.dni,
      cuil: values.cuil || undefined,
      dateOfBirth: values.dateOfBirth || undefined,
      nationality: values.nationality || undefined,
      status: values.status,
      address:
        values.addressStreet || values.addressNumber || values.addressCity || values.addressState || values.addressZipCode
          ? {
              street: values.addressStreet || '',
              number: values.addressNumber || '',
              city: values.addressCity || '',
              state: values.addressState || '',
              zipCode: values.addressZipCode || '',
            }
          : undefined,
      occupation: values.occupation || undefined,
      employer: values.employer || undefined,
      monthlyIncome: values.monthlyIncome ? Number(values.monthlyIncome) : undefined,
      employmentStatus: values.employmentStatus || undefined,
      emergencyContactName: values.emergencyContactName || undefined,
      emergencyContactPhone: values.emergencyContactPhone || undefined,
      emergencyContactRelationship: values.emergencyContactRelationship || undefined,
      creditScore: values.creditScore ? Number(values.creditScore) : undefined,
      notes: values.notes || undefined,
    };

    await onSubmit(payload);
  });

  return (
    <View>
      <Controller
        control={control}
        name="firstName"
        render={({ field }) => (
          <Field label={t('tenants.fields.firstName')} value={field.value} onChangeText={field.onChange} testID={`${testIDPrefix}.firstName`} />
        )}
      />
      <Controller
        control={control}
        name="lastName"
        render={({ field }) => (
          <Field label={t('tenants.fields.lastName')} value={field.value} onChangeText={field.onChange} testID={`${testIDPrefix}.lastName`} />
        )}
      />
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <Field
            label={t('tenants.fields.email')}
            value={field.value}
            onChangeText={field.onChange}
            autoCapitalize="none"
            keyboardType="email-address"
            testID={`${testIDPrefix}.email`}
          />
        )}
      />
      <Controller
        control={control}
        name="phone"
        render={({ field }) => (
          <Field
            label={t('tenants.fields.phone')}
            value={field.value}
            onChangeText={field.onChange}
            keyboardType="phone-pad"
            testID={`${testIDPrefix}.phone`}
          />
        )}
      />
      <Controller
        control={control}
        name="dni"
        render={({ field }) => (
          <Field label={t('tenants.fields.dni')} value={field.value} onChangeText={field.onChange} keyboardType="numeric" testID={`${testIDPrefix}.dni`} />
        )}
      />
      <Controller
        control={control}
        name="cuil"
        render={({ field }) => (
          <Field
            label={t('tenants.fields.cuil')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            testID={`${testIDPrefix}.cuil`}
          />
        )}
      />
      <Controller
        control={control}
        name="dateOfBirth"
        render={({ field }) => (
          <Field
            label={t('tenants.fields.dateOfBirth')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            testID={`${testIDPrefix}.dateOfBirth`}
          />
        )}
      />
      <Controller
        control={control}
        name="nationality"
        render={({ field }) => (
          <Field
            label={t('tenants.fields.nationality')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            testID={`${testIDPrefix}.nationality`}
          />
        )}
      />
      <Controller
        control={control}
        name="status"
        render={({ field }) => (
            <ChoiceGroup
              label={t('tenants.fields.status')}
              value={field.value}
              onChange={field.onChange}
              options={statusOptions.map((option) => ({
                value: option.value,
                label: t(`tenants.status.${option.value}`),
              }))}
              testID={`${testIDPrefix}.status`}
            />
          )}
        />
      <Controller
        control={control}
        name="addressStreet"
        render={({ field }) => (
          <Field
            label={t('tenants.fields.street')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            testID={`${testIDPrefix}.addressStreet`}
          />
        )}
      />
      <Controller
        control={control}
        name="addressNumber"
        render={({ field }) => (
          <Field
            label={t('tenants.fields.number')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            testID={`${testIDPrefix}.addressNumber`}
          />
        )}
      />
      <Controller
        control={control}
        name="addressCity"
        render={({ field }) => (
          <Field
            label={t('tenants.fields.city')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            testID={`${testIDPrefix}.addressCity`}
          />
        )}
      />
      <Controller
        control={control}
        name="addressState"
        render={({ field }) => (
          <Field
            label={t('tenants.fields.state')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            testID={`${testIDPrefix}.addressState`}
          />
        )}
      />
      <Controller
        control={control}
        name="addressZipCode"
        render={({ field }) => (
          <Field
            label={t('tenants.fields.zipCode')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            testID={`${testIDPrefix}.addressZipCode`}
          />
        )}
      />
      <Controller
        control={control}
        name="occupation"
        render={({ field }) => (
          <Field
            label={t('tenants.fields.occupation')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            testID={`${testIDPrefix}.occupation`}
          />
        )}
      />
      <Controller
        control={control}
        name="employer"
        render={({ field }) => (
          <Field
            label={t('tenants.fields.employer')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            testID={`${testIDPrefix}.employer`}
          />
        )}
      />
      <Controller
        control={control}
        name="monthlyIncome"
        render={({ field }) => (
          <Field
            label={t('tenants.fields.monthlyIncome')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            keyboardType="numeric"
            testID={`${testIDPrefix}.monthlyIncome`}
          />
        )}
      />
      <Controller
        control={control}
        name="employmentStatus"
        render={({ field }) => (
            <ChoiceGroup
              label={t('tenants.fields.employmentStatus')}
              value={field.value ?? 'employed'}
              onChange={field.onChange}
              options={employmentStatusOptions.map((option) => ({
                value: option.value,
                label: t(`tenants.employmentStatuses.${option.value}`),
              }))}
              testID={`${testIDPrefix}.employmentStatus`}
            />
          )}
        />
      <Controller
        control={control}
        name="emergencyContactName"
        render={({ field }) => (
          <Field
            label={t('tenants.fields.emergencyContactName')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            testID={`${testIDPrefix}.emergencyContactName`}
          />
        )}
      />
      <Controller
        control={control}
        name="emergencyContactPhone"
        render={({ field }) => (
          <Field
            label={t('tenants.fields.emergencyContactPhone')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            testID={`${testIDPrefix}.emergencyContactPhone`}
          />
        )}
      />
      <Controller
        control={control}
        name="emergencyContactRelationship"
        render={({ field }) => (
          <Field
            label={t('tenants.fields.emergencyContactRelationship')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            testID={`${testIDPrefix}.emergencyContactRelationship`}
          />
        )}
      />
      <Controller
        control={control}
        name="creditScore"
        render={({ field }) => (
          <Field
            label={t('tenants.fields.creditScore')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            keyboardType="numeric"
            testID={`${testIDPrefix}.creditScore`}
          />
        )}
      />
      <Controller
        control={control}
        name="notes"
        render={({ field }) => (
          <Field
            label={t('tenants.fields.notes')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            testID={`${testIDPrefix}.notes`}
          />
        )}
      />

      {Object.values(formState.errors).map((item) => {
        if (!item?.message) return null;
        return (
          <Text key={item.message} style={styles.error}>
            {item.message}
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
  error: {
    color: '#b91c1c',
    marginBottom: 6,
  },
});

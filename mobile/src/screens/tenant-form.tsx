import { ContactTools } from '@/components/contact-tools';
import type { ContactInput } from '../../../shared/contact-data';
import { Text, View } from '@/components/themed-native';
import { useGuidanceBlocker } from '@/components/guidance';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { AppButton, ChoiceGroup, Field } from '@/components/ui';
import type {
  CreateTenantInput,
  EmploymentStatus,
  Tenant,
  UpdateTenantInput,
} from '@/types/tenant';

const schema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.email(),
  phone: z.string().min(6),
  dni: z.string().min(6),
  cuil: z.string().optional(),
  dateOfBirth: z.string().optional(),
  nationality: z.string().optional(),
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

type TenantFormProps = Readonly<{
  initial?: Tenant;
  submitting?: boolean;
  onSubmit: (payload: CreateTenantInput | UpdateTenantInput) => Promise<void>;
  submitLabel: string;
  testIDPrefix?: string;
}>;

const employmentStatusOptions: Array<{
  label: string;
  value: EmploymentStatus;
}> = [
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
  const [contactInput, setContactInput] = useState<ContactInput>({});
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

  const { control, watch, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  useGuidanceBlocker(
    `${testIDPrefix}.validation`,
    Object.keys(formState.errors).length > 0,
  );

  const submit = handleSubmit(async (values) => {
    const payload: CreateTenantInput = {
      ...contactInput,
      status: initial?.status ?? 'INACTIVE',
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      phone: values.phone,
      dni: values.dni,
      cuil: values.cuil || undefined,
      dateOfBirth: values.dateOfBirth || undefined,
      nationality: values.nationality || undefined,
      occupation: values.occupation || undefined,
      employer: values.employer || undefined,
      monthlyIncome: values.monthlyIncome
        ? Number(values.monthlyIncome)
        : undefined,
      employmentStatus: values.employmentStatus || undefined,
      emergencyContactName: values.emergencyContactName || undefined,
      emergencyContactPhone: values.emergencyContactPhone || undefined,
      emergencyContactRelationship:
        values.emergencyContactRelationship || undefined,
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
          <Field
            label={t('tenants.fields.firstName')}
            value={field.value}
            onChangeText={field.onChange}
            testID={`${testIDPrefix}.firstName`}
          />
        )}
      />
      <Controller
        control={control}
        name="lastName"
        render={({ field }) => (
          <Field
            label={t('tenants.fields.lastName')}
            value={field.value}
            onChangeText={field.onChange}
            testID={`${testIDPrefix}.lastName`}
          />
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
          <Field
            label={t('tenants.fields.dni')}
            value={field.value}
            onChangeText={field.onChange}
            keyboardType="numeric"
            testID={`${testIDPrefix}.dni`}
          />
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

      {Object.entries(formState.errors).map(([fieldName, item]) => {
        if (!item?.message) return null;
        return (
          <Text key={fieldName} style={styles.error}>
            {item.message}
          </Text>
        );
      })}

      <AppButton
        title={submitLabel}
        onPress={() => {
          void submit().catch(() => undefined);
        }}
        loading={submitting}
        disabled={submitting}
        testID={`${testIDPrefix}.submit`}
      />
      <ContactTools
        value={contactInput}
        onChange={setContactInput}
        phones={{
          phone: watch('phone') ?? '',
          emergencyContactPhone: watch('emergencyContactPhone') ?? '',
        }}
        editAddress
        initialAddress={initial?.contactAddress}
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

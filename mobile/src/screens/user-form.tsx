import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { AppButton, ChoiceGroup, Field } from '@/components/ui';
import type { User } from '@/types/auth';
import type { CreateManagedUserInput, UpdateManagedUserInput } from '@/api/users';

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  role: z.enum(['admin', 'owner', 'tenant', 'staff']),
});

const editSchema = createSchema.extend({
  password: z.string().optional(),
});

type CreateFormValues = z.infer<typeof createSchema>;
type EditFormValues = z.infer<typeof editSchema>;
type FormValues = CreateFormValues | EditFormValues;

type UserFormProps = {
  mode: 'create' | 'edit';
  initial?: User;
  submitting?: boolean;
  onSubmit: (payload: CreateManagedUserInput | UpdateManagedUserInput) => Promise<void>;
  submitLabel: string;
  testIDPrefix?: string;
};

const roleOptions: Array<{ label: string; value: User['role'] }> = [
  { label: 'admin', value: 'admin' },
  { label: 'owner', value: 'owner' },
  { label: 'tenant', value: 'tenant' },
  { label: 'staff', value: 'staff' },
];

export function UserForm({
  mode,
  initial,
  submitting,
  onSubmit,
  submitLabel,
  testIDPrefix = 'userForm',
}: UserFormProps) {
  const { t } = useTranslation();

  const defaults = useMemo(
    () => ({
      email: initial?.email ?? '',
      password: '',
      firstName: initial?.firstName ?? '',
      lastName: initial?.lastName ?? '',
      phone: initial?.phone ?? '',
      role: initial?.role ?? 'staff',
    }),
    [initial],
  );

  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(mode === 'create' ? createSchema : editSchema),
    defaultValues: defaults,
  });

  const submit = handleSubmit(async (values) => {
    if (mode === 'create') {
      await onSubmit({
        email: values.email.trim().toLowerCase(),
        password: (values as CreateFormValues).password,
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        phone: values.phone?.trim() || undefined,
        role: values.role,
      } satisfies CreateManagedUserInput);
      return;
    }

    await onSubmit({
      email: values.email.trim().toLowerCase(),
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      phone: values.phone?.trim() || undefined,
    } satisfies UpdateManagedUserInput);
  });

  return (
    <View>
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <Field
            label={t('auth.email')}
            value={field.value}
            onChangeText={field.onChange}
            autoCapitalize="none"
            keyboardType="email-address"
            testID={`${testIDPrefix}.email`}
          />
        )}
      />

      {mode === 'create' ? (
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <Field
              label={t('auth.password')}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              secureTextEntry
              autoCapitalize="none"
              testID={`${testIDPrefix}.password`}
            />
          )}
        />
      ) : null}

      <Controller
        control={control}
        name="firstName"
        render={({ field }) => (
          <Field label={t('auth.firstName')} value={field.value} onChangeText={field.onChange} testID={`${testIDPrefix}.firstName`} />
        )}
      />
      <Controller
        control={control}
        name="lastName"
        render={({ field }) => (
          <Field label={t('auth.lastName')} value={field.value} onChangeText={field.onChange} testID={`${testIDPrefix}.lastName`} />
        )}
      />
      <Controller
        control={control}
        name="phone"
        render={({ field }) => (
          <Field
            label={t('auth.phone')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            keyboardType="phone-pad"
            testID={`${testIDPrefix}.phone`}
          />
        )}
      />

      {mode === 'create' ? (
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <ChoiceGroup
              label={t('auth.role')}
              value={field.value}
              onChange={field.onChange}
              options={roleOptions.map((option) => ({
                value: option.value,
                label:
                  option.value === 'owner'
                    ? t('auth.roles.owner')
                    : option.value === 'tenant'
                      ? t('auth.roles.tenant')
                      : option.value,
              }))}
              testID={`${testIDPrefix}.role`}
            />
          )}
        />
      ) : null}

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

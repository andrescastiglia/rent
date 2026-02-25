import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { leasesApi } from '@/api/leases';
import { paymentsApi, tenantAccountsApi } from '@/api/payments';
import { tenantsApi } from '@/api/tenants';
import { Screen } from '@/components/screen';
import { AppButton, ChoiceGroup, DateField, Field, H1 } from '@/components/ui';
import type { CreatePaymentInput, PaymentMethod } from '@/types/payment';

const schema = z.object({
  leaseId: z.string().min(1, 'Selecciona un contrato'),
  amount: z.string().min(1, 'El monto es obligatorio'),
  paymentDate: z.string().min(10, 'La fecha es obligatoria'),
  method: z.enum(['cash', 'bank_transfer', 'credit_card', 'debit_card', 'check', 'digital_wallet', 'crypto', 'other']),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const methodOptions: Array<{ label: string; value: PaymentMethod }> = [
  { label: 'Transferencia', value: 'bank_transfer' },
  { label: 'Efectivo', value: 'cash' },
  { label: 'Tarjeta crédito', value: 'credit_card' },
  { label: 'Tarjeta débito', value: 'debit_card' },
  { label: 'Cheque', value: 'check' },
  { label: 'Billetera', value: 'digital_wallet' },
  { label: 'Cripto', value: 'crypto' },
  { label: 'Otro', value: 'other' },
];

export default function NewTenantPaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const tenantQuery = useQuery({
    queryKey: ['tenants', id],
    queryFn: () => tenantsApi.getById(id),
    enabled: Boolean(id),
  });

  const leasesQuery = useQuery({
    queryKey: ['leases', 'tenant', id],
    queryFn: async () => {
      const all = await leasesApi.getAll();
      return all.filter((lease) => lease.tenantId === id);
    },
    enabled: Boolean(id),
  });

  const leaseOptions = useMemo(
    () =>
      (leasesQuery.data ?? []).map((lease) => ({
        value: lease.id,
        label: lease.property?.name ? `${lease.id} · ${lease.property.name}` : lease.id,
      })),
    [leasesQuery.data],
  );

  const { control, handleSubmit, formState, setValue, getValues } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      leaseId: '',
      amount: '',
      paymentDate: new Date().toISOString().slice(0, 10),
      method: 'bank_transfer',
      reference: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (!leaseOptions.length) return;
    const currentLeaseId = getValues('leaseId');
    if (currentLeaseId) return;
    const preferred = (leasesQuery.data ?? []).find((lease) => lease.status === 'ACTIVE') ?? leasesQuery.data?.[0];
    if (preferred) {
      setValue('leaseId', preferred.id);
    }
  }, [leaseOptions, leasesQuery.data, setValue, getValues]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const account = await tenantAccountsApi.getByLease(values.leaseId);
      if (!account) {
        throw new Error(t('tenants.paymentRegistration.noAccount'));
      }

      const amount = Number(values.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(t('tenants.errors.invalidPaymentAmount'));
      }

      const payload: CreatePaymentInput = {
        tenantAccountId: account.id,
        amount,
        paymentDate: values.paymentDate,
        method: values.method,
        reference: values.reference || undefined,
        notes: values.notes || undefined,
      };

      return paymentsApi.create(payload);
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['payments'] });
      router.replace(`/(app)/payments/${created.id}` as never);
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.saveError'));
    },
  });

  const submit = handleSubmit((values) => mutation.mutate(values));
  const tenantName = `${tenantQuery.data?.firstName ?? ''} ${tenantQuery.data?.lastName ?? ''}`.trim();

  return (
    <Screen>
      <H1>{t('tenants.paymentRegistration.title')}</H1>
      {tenantName ? <Text style={styles.subtitle}>{tenantName}</Text> : null}
      {tenantQuery.data?.email ? <Text style={styles.subtitle}>{tenantQuery.data.email}</Text> : null}

      {leasesQuery.isLoading ? <Text style={styles.help}>{t('common.loading')}</Text> : null}
      {!leasesQuery.isLoading && leaseOptions.length === 0 ? (
        <Text style={styles.warn}>{t('tenants.noActiveLeases')}</Text>
      ) : null}

      {leaseOptions.length > 0 ? (
        <Controller
          control={control}
          name="leaseId"
          render={({ field }) => (
            <ChoiceGroup
              label={t('leases.title')}
              value={field.value}
              onChange={field.onChange}
              options={leaseOptions}
              testID="tenantPaymentCreate.lease"
            />
          )}
        />
      ) : null}

      <Controller
        control={control}
        name="amount"
        render={({ field }) => (
          <Field
            label={t('tenants.paymentRegistration.amount')}
            value={field.value}
            onChangeText={field.onChange}
            keyboardType="numeric"
            testID="tenantPaymentCreate.amount"
          />
        )}
      />
      <Controller
        control={control}
        name="paymentDate"
        render={({ field }) => (
          <DateField
            label={t('payments.date')}
            value={field.value}
            onChange={field.onChange}
            testID="tenantPaymentCreate.date"
          />
        )}
      />
      <Controller
        control={control}
        name="method"
        render={({ field }) => (
          <ChoiceGroup
            label={t('payments.method.label')}
            value={field.value}
            onChange={field.onChange}
            options={methodOptions.map((option) => ({ ...option, label: t(`payments.method.${option.value}`) }))}
            testID="tenantPaymentCreate.method"
          />
        )}
      />
      <Controller
        control={control}
        name="reference"
        render={({ field }) => (
          <Field
            label={t('payments.reference')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            testID="tenantPaymentCreate.reference"
          />
        )}
      />
      <Controller
        control={control}
        name="notes"
        render={({ field }) => (
          <Field
            label={t('payments.notes')}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            testID="tenantPaymentCreate.notes"
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

      <View style={styles.actions}>
        <AppButton
          title={t('tenants.paymentRegistration.submit')}
          onPress={submit}
          loading={mutation.isPending}
          disabled={leaseOptions.length === 0}
          testID="tenantPaymentCreate.submit"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: '#334155',
    marginBottom: 2,
  },
  help: {
    color: '#475569',
    marginBottom: 8,
  },
  warn: {
    color: '#92400e',
    marginBottom: 8,
  },
  actions: {
    marginTop: 8,
  },
  error: {
    color: '#b91c1c',
    marginBottom: 6,
  },
});

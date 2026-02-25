import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { leasesApi } from '@/api/leases';
import { paymentsApi, tenantAccountsApi } from '@/api/payments';
import { Screen } from '@/components/screen';
import { AppButton, ChoiceGroup, DateField, Field, H1 } from '@/components/ui';
import type { CreatePaymentInput, PaymentMethod } from '@/types/payment';

const schema = z.object({
  leaseId: z.string().min(1),
  amount: z.string().min(1),
  paymentDate: z.string().min(10),
  method: z.enum(['cash', 'bank_transfer', 'credit_card', 'debit_card', 'check', 'digital_wallet', 'crypto', 'other']),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function NewPaymentScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const methodOptions: Array<{ label: string; value: PaymentMethod }> = [
    { label: t('payments.method.bank_transfer'), value: 'bank_transfer' },
    { label: t('payments.method.cash'), value: 'cash' },
    { label: t('payments.method.credit_card'), value: 'credit_card' },
    { label: t('payments.method.debit_card'), value: 'debit_card' },
    { label: t('payments.method.check'), value: 'check' },
    { label: t('payments.method.digital_wallet'), value: 'digital_wallet' },
    { label: t('payments.method.crypto'), value: 'crypto' },
    { label: t('payments.method.other'), value: 'other' },
  ];

  const leasesQuery = useQuery({
    queryKey: ['leases'],
    queryFn: leasesApi.getAll,
  });

  const { control, handleSubmit, formState } = useForm<FormValues>({
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

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const account = await tenantAccountsApi.getByLease(values.leaseId);
      if (!account) {
        throw new Error(t('tenants.paymentRegistration.noAccount'));
      }

      const payload: CreatePaymentInput = {
        tenantAccountId: account.id,
        amount: Number(values.amount),
        paymentDate: values.paymentDate,
        method: values.method,
        reference: values.reference || undefined,
        notes: values.notes || undefined,
      };

      return paymentsApi.create(payload);
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['payments'] });
      router.replace(`/(app)/payments/${created.id}`);
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.saveError'));
    },
  });

  const submit = handleSubmit((values) => mutation.mutate(values));

  return (
    <Screen>
      <H1>{t('payments.newPayment')}</H1>

      <Controller
        control={control}
        name="leaseId"
        render={({ field }) => (
          <Field
            label={t('payments.selectLease')}
            value={field.value}
            onChangeText={field.onChange}
            placeholder={leasesQuery.data?.[0]?.id ?? t('payments.selectLeasePlaceholder')}
            testID="paymentCreate.leaseId"
          />
        )}
      />

      <View style={styles.hintBox}>
        <Text style={styles.hintTitle}>{t('leases.title')}</Text>
        <Text style={styles.hintText}>{leasesQuery.data?.map((lease) => lease.id).join(', ') || '-'}</Text>
      </View>

      <Controller
        control={control}
        name="amount"
        render={({ field }) => (
          <Field
            label={t('payments.amount')}
            value={field.value}
            onChangeText={field.onChange}
            keyboardType="numeric"
            testID="paymentCreate.amount"
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
            testID="paymentCreate.paymentDate"
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
            options={methodOptions}
            testID="paymentCreate.method"
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
            testID="paymentCreate.reference"
          />
        )}
      />
      <Controller
        control={control}
        name="notes"
        render={({ field }) => (
          <Field label={t('payments.notes')} value={field.value ?? ''} onChangeText={field.onChange} testID="paymentCreate.notes" />
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

      <AppButton title={t('payments.savePayment')} onPress={submit} loading={mutation.isPending} testID="paymentCreate.submit" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hintBox: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    padding: 10,
  },
  hintTitle: {
    color: '#1e3a8a',
    fontWeight: '700',
    marginBottom: 4,
  },
  hintText: {
    color: '#1d4ed8',
  },
  error: {
    color: '#b91c1c',
    marginBottom: 6,
  },
});

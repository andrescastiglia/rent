import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { paymentsApi } from '@/api/payments';
import { Screen } from '@/components/screen';
import { AppButton, H1 } from '@/components/ui';

export default function PaymentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const query = useQuery({
    queryKey: ['payments', id],
    queryFn: () => paymentsApi.getById(id),
    enabled: Boolean(id),
  });

  const confirmMutation = useMutation({
    mutationFn: () => paymentsApi.confirm(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['payments'] });
      await queryClient.invalidateQueries({ queryKey: ['payments', id] });
      Alert.alert(t('payments.confirmPayment'));
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.saveError'));
    },
  });

  const downloadMutation = useMutation({
    mutationFn: () => paymentsApi.downloadReceiptPdf(id),
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.loadError'));
    },
  });

  const payment = query.data;

  return (
    <Screen scrollViewTestID="paymentDetail.scroll">
      <H1>{t('payments.paymentDetails')}</H1>
      {query.isLoading ? <Text>{t('common.loading')}</Text> : null}
      {query.error ? <Text style={styles.error}>{(query.error as Error).message}</Text> : null}
      {!query.isLoading && !payment ? <Text>{t('payments.notFound')}</Text> : null}

      {payment ? (
        <View style={styles.actions}>
          {payment.status === 'pending' ? (
            <AppButton
              title={t('payments.confirmPayment')}
              loading={confirmMutation.isPending}
              testID="paymentDetail.confirm"
              onPress={() => confirmMutation.mutate()}
            />
          ) : null}

          {payment.receipt ? (
            <AppButton
              title={t('payments.downloadReceipt')}
              variant="secondary"
              loading={downloadMutation.isPending}
              testID="paymentDetail.downloadReceipt"
              onPress={() => downloadMutation.mutate()}
            />
          ) : (
            <Text style={styles.warn}>{t('payments.receiptPendingDescription')}</Text>
          )}
        </View>
      ) : null}

      {payment ? (
        <View style={styles.card}>
          <Text style={styles.title}>{`Pago ${payment.id}`}</Text>
          <Text style={styles.detail}>{`${payment.currencyCode} ${payment.amount}`}</Text>
          <Text style={styles.detail}>{`${t('invoices.paymentStatus')}: ${payment.status}`}</Text>
          <Text style={styles.detail}>{`${t('payments.method.label')}: ${payment.method}`}</Text>
          <Text style={styles.detail}>{`${t('payments.date')}: ${payment.paymentDate}`}</Text>
          <Text style={styles.detail}>{`${t('payments.reference')}: ${payment.reference ?? '-'}`}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 12,
    gap: 6,
  },
  title: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 18,
  },
  detail: {
    color: '#334155',
  },
  actions: {
    marginTop: 16,
    gap: 10,
  },
  warn: {
    color: '#92400e',
  },
  error: {
    color: '#b91c1c',
  },
});

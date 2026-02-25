import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { invoicesApi } from '@/api/payments';
import { Screen } from '@/components/screen';
import { AppButton, H1 } from '@/components/ui';

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();

  const query = useQuery({
    queryKey: ['invoices', id],
    queryFn: () => invoicesApi.getById(id),
    enabled: Boolean(id),
  });

  const downloadMutation = useMutation({
    mutationFn: () => invoicesApi.downloadPdf(id),
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.loadError'));
    },
  });

  const invoice = query.data;

  return (
    <Screen scrollViewTestID="invoiceDetail.scroll">
      <H1>{t('invoices.invoiceDetails')}</H1>
      {query.isLoading ? <Text>{t('common.loading')}</Text> : null}
      {query.error ? <Text style={styles.error}>{(query.error as Error).message}</Text> : null}
      {!query.isLoading && !invoice ? <Text>{t('invoices.notFound')}</Text> : null}

      {invoice ? (
        <View style={styles.card}>
          <Text style={styles.title}>{invoice.invoiceNumber}</Text>
          <Text style={styles.detail}>{`${invoice.currencyCode} ${invoice.total}`}</Text>
          <Text style={styles.detail}>{`${t('invoices.paymentStatus')}: ${invoice.status}`}</Text>
          <Text style={styles.detail}>{`${t('invoices.dueDate')}: ${invoice.dueDate}`}</Text>
          <Text style={styles.detail}>{`${t('invoices.amountPaid')}: ${invoice.amountPaid}`}</Text>
        </View>
      ) : null}

      {invoice ? (
        <View style={styles.actions}>
          <AppButton
            title={t('invoices.downloadPdf')}
            loading={downloadMutation.isPending}
            testID="invoiceDetail.downloadPdf"
            onPress={() => downloadMutation.mutate()}
          />
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
  error: {
    color: '#b91c1c',
  },
});

import { ActivityIndicator, Text, View } from '@/components/themed-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { salesApi } from '@/api/sales';
import { Screen } from '@/components/screen';
import { AppButton } from '@/components/ui';
import { Pagination } from '@/components/pagination';

export default function SaleDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const agreement = useQuery({
    queryKey: ['sales', id],
    queryFn: () => salesApi.getAgreement(id),
  });
  const schedule = useQuery({
    queryKey: ['sales', id, 'schedule', page],
    queryFn: () => salesApi.getSchedule(id, page),
  });
  const receipts = useQuery({
    queryKey: ['sales', id, 'receipts'],
    queryFn: () => salesApi.getReceipts(id),
  });
  const error = agreement.error ?? schedule.error ?? receipts.error;
  const loading =
    agreement.isFetching || schedule.isFetching || receipts.isFetching;
  const [downloading, setDownloading] = useState(false);
  return (
    <Screen
      guidanceReady={!loading}
      guidanceBlocked={Boolean(error) || downloading}
    >
      {loading ? <ActivityIndicator /> : null}
      {error ? (
        <View>
          <Text style={styles.error} accessibilityRole="alert">
            {error.message}
          </Text>
          <AppButton
            title={t('common.retry')}
            onPress={() => {
              void agreement.refetch();
              void schedule.refetch();
              void receipts.refetch();
            }}
          />
        </View>
      ) : null}
      {agreement.data ? (
        <View style={styles.card}>
          <Text style={styles.title}>{agreement.data.buyerName}</Text>
          <Text>
            {t('sales.totalAmount')}: {agreement.data.currency}{' '}
            {agreement.data.totalAmount}
          </Text>
        </View>
      ) : null}
      {schedule.data ? (
        <View style={styles.card}>
          <Text>
            {t('sales.balanceLabel')}: {schedule.data.currency}{' '}
            {schedule.data.balance}
          </Text>
          <Text>
            {t('sales.overdueLabel')}: {schedule.data.currency}{' '}
            {schedule.data.overdueAmount}
          </Text>
          <Text>{t('sales.asOf', { date: schedule.data.asOf })}</Text>
          {schedule.data.data.map((installment) => (
            <View
              key={installment.installmentNumber}
              style={styles.installment}
            >
              <Text style={styles.title}>
                {t('sales.installmentLabel')} {installment.installmentNumber} ·{' '}
                {installment.dueDate}
              </Text>
              <Text>
                {t('sales.amount')}: {schedule.data.currency}{' '}
                {installment.amount}
              </Text>
              <Text>
                {t('sales.paidLabel')}: {installment.paidAmount} ·{' '}
                {t('sales.balanceLabel')}: {installment.balance}
              </Text>
              <Text>{installment.status}</Text>
            </View>
          ))}
          <Pagination
            result={schedule.data}
            loading={schedule.isFetching}
            onPage={setPage}
          />
        </View>
      ) : null}
      {receipts.data?.map((receipt) => (
        <View key={receipt.id} style={styles.card}>
          <Text>
            {receipt.receiptNumber} · {receipt.currency} {receipt.amount}
          </Text>
          <Text>{receipt.paymentDate}</Text>
          <AppButton
            title={t('channels.downloadReceipt')}
            variant="secondary"
            loading={downloading}
            onPress={() => {
              setDownloading(true);
              void salesApi
                .downloadReceipt(receipt.id)
                .catch((cause) =>
                  Alert.alert(
                    t('common.error'),
                    cause instanceof Error
                      ? cause.message
                      : t('channels.openError'),
                  ),
                )
                .finally(() => setDownloading(false));
            }}
          />
        </View>
      ))}
    </Screen>
  );
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
  },
  installment: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#d9dee7',
    gap: 4,
  },
  title: { color: '#202832', fontWeight: '700' },
  error: { color: '#b42318', marginBottom: 8 },
});

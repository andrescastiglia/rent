import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { invoicesApi, paymentsApi } from '@/api/payments';
import { Screen } from '@/components/screen';
import { ChoiceGroup, H1 } from '@/components/ui';
import { i18n } from '@/i18n';
import type { Payment, PaymentStatus } from '@/types/payment';

type StatusFilter = 'all' | PaymentStatus;

const formatAmount = (payment: Payment) => {
  try {
    return new Intl.NumberFormat(i18n.language || 'es', {
      style: 'currency',
      currency: payment.currencyCode || 'ARS',
      maximumFractionDigits: 0,
    }).format(payment.amount);
  } catch {
    return `${payment.currencyCode} ${payment.amount}`;
  }
};

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString(i18n.language || 'es');
};

const statusStyle = (status: PaymentStatus) => {
  if (status === 'completed') return styles.statusCompleted;
  if (status === 'pending') return styles.statusPending;
  if (status === 'processing') return styles.statusProcessing;
  if (status === 'failed') return styles.statusFailed;
  if (status === 'refunded') return styles.statusRefunded;
  return styles.statusCancelled;
};

const toSearchHaystack = (payment: Payment) =>
  `${payment.reference ?? ''} ${payment.receipt?.receiptNumber ?? ''}`.toLowerCase();

function ActionChip({
  title,
  onPress,
  variant = 'primary',
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  testID?: string;
}) {
  return (
    <Pressable
      style={[styles.actionChip, variant === 'secondary' && styles.actionChipSecondary]}
      onPress={onPress}
      testID={testID}
    >
      <Text style={[styles.actionChipText, variant === 'secondary' && styles.actionChipTextSecondary]}>{title}</Text>
    </Pressable>
  );
}

export default function PaymentsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const statusOptions: Array<{ label: string; value: StatusFilter }> = [
    { label: t('payments.allStatuses'), value: 'all' },
    { label: t('payments.status.pending'), value: 'pending' },
    { label: t('payments.status.processing'), value: 'processing' },
    { label: t('payments.status.completed'), value: 'completed' },
    { label: t('payments.status.failed'), value: 'failed' },
    { label: t('payments.status.refunded'), value: 'refunded' },
    { label: t('payments.status.cancelled'), value: 'cancelled' },
  ];

  const statusLabel = (status: PaymentStatus) => t(`payments.status.${status}`);

  const paymentsQuery = useQuery({
    queryKey: ['payments', 'list', statusFilter],
    queryFn: () => paymentsApi.getAllWithFilters(statusFilter === 'all' ? undefined : { status: statusFilter }),
  });

  const filteredPayments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const items = [...(paymentsQuery.data?.data ?? [])].sort(
      (a, b) =>
        new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime() ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    if (!term) return items;
    return items.filter((payment) => toSearchHaystack(payment).includes(term));
  }, [paymentsQuery.data?.data, searchTerm]);

  const handleDownload = async (payment: Payment) => {
    try {
      setDownloadingId(payment.id);
      if (payment.receipt?.pdfUrl) {
        await paymentsApi.downloadReceiptPdf(payment.id);
        return;
      }
      if (payment.invoiceId) {
        await invoicesApi.downloadPdf(payment.invoiceId);
      }
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Screen>
      <H1>{t('payments.title')}</H1>
      <Text style={styles.subtitle}>{t('payments.subtitle')}</Text>

      <TextInput
        value={searchTerm}
        onChangeText={setSearchTerm}
        placeholder={t('payments.searchPlaceholder')}
        style={styles.searchInput}
        autoCapitalize="none"
        testID="payments.search"
      />

      <ChoiceGroup
        label={t('common.filter')}
        value={statusFilter}
        onChange={setStatusFilter}
        options={statusOptions}
        testID="payments.status"
      />

      {paymentsQuery.isLoading ? <ActivityIndicator /> : null}
      {paymentsQuery.error ? <Text style={styles.error}>{(paymentsQuery.error as Error).message}</Text> : null}

      <View style={styles.list}>
        {filteredPayments.map((payment) => {
          const hasFile = Boolean(payment.receipt?.pdfUrl || payment.invoiceId);
          return (
            <View key={payment.id} style={styles.card} testID={`payments.item.${payment.id}`}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderText}>
                  <Text style={styles.title}>{t('payments.tenantPaymentEntry')}</Text>
                  <Text style={styles.detail}>{formatDate(payment.paymentDate)}</Text>
                  {payment.reference ? <Text style={styles.detail}>{payment.reference}</Text> : null}
                  {payment.receipt?.receiptNumber ? <Text style={styles.detail}>{payment.receipt.receiptNumber}</Text> : null}
                </View>
                <View style={styles.cardAmountBlock}>
                  <Text style={styles.amount}>{`+ ${formatAmount(payment)}`}</Text>
                  <Text style={[styles.statusBadge, statusStyle(payment.status)]}>{statusLabel(payment.status)}</Text>
                </View>
              </View>

              <View style={styles.actionsRow}>
                <ActionChip
                  title={t('payments.viewPayment')}
                  onPress={() => router.push(`/(app)/payments/${payment.id}` as never)}
                  testID={`payments.view.${payment.id}`}
                />
                {hasFile ? (
                  <ActionChip
                    title={downloadingId === payment.id ? t('common.loading') : t('payments.downloadReceipt')}
                    variant="secondary"
                    onPress={() => {
                      void handleDownload(payment);
                    }}
                    testID={`payments.download.${payment.id}`}
                  />
                ) : null}
              </View>
            </View>
          );
        })}

        {!paymentsQuery.isLoading && filteredPayments.length === 0 ? (
          <Text style={styles.empty}>{t('payments.noPaymentsDescription')}</Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: '#64748b',
    marginBottom: 8,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    color: '#111827',
    marginBottom: 4,
  },
  list: {
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardHeaderText: {
    flex: 1,
    gap: 2,
  },
  cardAmountBlock: {
    alignItems: 'flex-end',
    gap: 6,
  },
  title: {
    fontWeight: '700',
    color: '#0f172a',
  },
  amount: {
    color: '#15803d',
    fontSize: 16,
    fontWeight: '700',
  },
  detail: {
    color: '#475569',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
    textTransform: 'uppercase',
  },
  statusCompleted: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  statusPending: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  statusProcessing: {
    backgroundColor: '#dbeafe',
    color: '#1e3a8a',
  },
  statusFailed: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  statusRefunded: {
    backgroundColor: '#ede9fe',
    color: '#5b21b6',
  },
  statusCancelled: {
    backgroundColor: '#e2e8f0',
    color: '#334155',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionChip: {
    borderWidth: 1,
    borderColor: '#1d4ed8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#dbeafe',
  },
  actionChipSecondary: {
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  actionChipText: {
    color: '#1e3a8a',
    fontWeight: '700',
    fontSize: 12,
  },
  actionChipTextSecondary: {
    color: '#334155',
  },
  empty: {
    color: '#475569',
  },
  error: {
    color: '#b91c1c',
    marginBottom: 8,
  },
});

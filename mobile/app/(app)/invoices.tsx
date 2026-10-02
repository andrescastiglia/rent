import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from '@/components/themed-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { invoicesApi } from '@/api/payments';
import { Pagination } from '@/components/pagination';
import { Screen } from '@/components/screen';
import { ChoiceGroup, Field, H1 } from '@/components/ui';
import type { InvoiceStatus } from '@/types/payment';

type InvoiceStatusFilter = InvoiceStatus | 'all';

export default function InvoicesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatusFilter>('all');

  const statusOptions: Array<{ label: string; value: InvoiceStatusFilter }> = [
    { label: t('invoices.allStatuses'), value: 'all' },
    { label: t('invoices.status.draft'), value: 'draft' },
    { label: t('invoices.status.pending'), value: 'pending' },
    { label: t('invoices.status.sent'), value: 'sent' },
    { label: t('invoices.status.partial'), value: 'partial' },
    { label: t('invoices.status.paid'), value: 'paid' },
    { label: t('invoices.status.overdue'), value: 'overdue' },
    { label: t('invoices.status.cancelled'), value: 'cancelled' },
    { label: t('invoices.status.refunded'), value: 'refunded' },
  ];

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['invoices', statusFilter, searchTerm, page],
    queryFn: () =>
      invoicesApi.getAll({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: searchTerm,
        page,
        limit: 20,
      }),
  });
  const filteredInvoices = data?.data ?? [];

  return (
    <Screen guidanceReady={!isFetching} guidanceBlocked={Boolean(error)}>
      <View style={styles.headerRow}>
        <H1>{t('invoices.title')}</H1>
      </View>

      <View style={styles.filters}>
        <Field
          label={t('common.search')}
          placeholder={t('invoices.searchPlaceholder')}
          value={searchTerm}
          onChangeText={(value) => {
            setSearchTerm(value);
            setPage(1);
          }}
          autoCapitalize="none"
          testID="invoices.search"
        />
        <ChoiceGroup
          label={t('common.filter')}
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value);
            setPage(1);
          }}
          options={statusOptions}
          testID="invoices.status"
        />
      </View>

      {isLoading ? <ActivityIndicator /> : null}
      {error ? <Text style={styles.error}>{error.message}</Text> : null}

      <View style={styles.list}>
        {filteredInvoices.map((invoice) => (
          <Pressable
            key={invoice.id}
            testID={`invoices.item.${invoice.id}`}
            style={styles.card}
            onPress={() => router.push(`/(app)/invoices/${invoice.id}`)}
          >
            <Text style={styles.title}>{invoice.invoiceNumber}</Text>
            <Text
              style={styles.detail}
            >{`${invoice.currencyCode} ${invoice.total}`}</Text>
            <Text style={styles.detail}>{invoice.status}</Text>
          </Pressable>
        ))}
        {!isLoading && !error && filteredInvoices.length === 0 ? (
          <Text style={styles.empty}>
            {t('invoices.noInvoicesDescription')}
          </Text>
        ) : null}
      </View>
      <Pagination result={data} loading={isFetching} onPage={setPage} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  filters: {
    marginBottom: 12,
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
  },
  title: {
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  detail: {
    color: '#475569',
  },
  empty: {
    color: '#475569',
    textAlign: 'center',
    marginTop: 8,
  },
  error: {
    color: '#b91c1c',
  },
});

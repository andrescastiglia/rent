import { FlatList, Pressable, Text, View } from '@/components/themed-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { salesApi } from '@/api/sales';
import { Screen } from '@/components/screen';
import { Field, H1 } from '@/components/ui';
import { Pagination } from '@/components/pagination';
import { QueryStatus } from '@/components/query-status';

function ItemSeparator() {
  return <View style={styles.separator} />;
}

export default function SalesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['sales', 'agreements', page, search],
    queryFn: () => salesApi.getAgreementsPage({ page, limit: 20, search }),
  });
  return (
    <Screen
      scrollable={false}
      guidanceReady={!query.isFetching}
      guidanceBlocked={query.isError}
    >
      <FlatList
        data={query.data?.data ?? []}
        keyExtractor={(agreement) => agreement.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <H1>{t('sales.title')}</H1>
            <Text>{t('channels.salesInstallments')}</Text>
            <Field
              label={t('common.search')}
              value={search}
              onChangeText={(value) => {
                setSearch(value);
                setPage(1);
              }}
              testID="sales.search"
            />
            <QueryStatus
              query={query}
              empty={!query.data?.total}
              emptyLabel={t('common.noDataAvailable')}
            />
          </>
        }
        ListFooterComponent={
          <Pagination
            result={query.data}
            loading={query.isFetching}
            onPage={setPage}
          />
        }
        ItemSeparatorComponent={ItemSeparator}
        renderItem={({ item: agreement }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${agreement.buyerName} · ${agreement.currency} ${agreement.totalAmount}`}
            onPress={() => router.push(`/(app)/sales/${agreement.id}` as never)}
          >
            <View style={styles.card}>
              <Text style={styles.title}>{agreement.buyerName}</Text>
              <Text>{`${agreement.currency} ${agreement.totalAmount}`}</Text>
              <Text>
                {t('sales.balanceLabel')}: {agreement.currency}{' '}
                {Number(agreement.totalAmount) - Number(agreement.paidAmount)}
              </Text>
              <Text>
                {t('sales.installmentsCount')}: {agreement.installmentCount}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  separator: { height: 12 },
  card: {
    borderWidth: 1,
    borderColor: '#d9dee7',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    minHeight: 44,
  },
  title: { fontWeight: '700', color: '#202832', fontSize: 16 },
});

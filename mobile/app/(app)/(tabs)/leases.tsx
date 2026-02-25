import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { leasesApi } from '@/api/leases';
import { Screen } from '@/components/screen';
import { AppButton, H1 } from '@/components/ui';
import { i18n } from '@/i18n';
import type { Lease } from '@/types/lease';

const formatMoney = (amount: number, currencyCode = 'ARS') => {
  try {
    return new Intl.NumberFormat(i18n.language || 'es', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount}`;
  }
};

const toDate = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString(i18n.language || 'es');
};

const statusStyle = (value: Lease['status']) => {
  if (value === 'ACTIVE') return styles.statusActive;
  if (value === 'FINALIZED') return styles.statusFinalized;
  return styles.statusDraft;
};

const tenantDisplayName = (lease: Lease) => {
  const fullName = `${lease.tenant?.firstName ?? ''} ${lease.tenant?.lastName ?? ''}`.trim();
  return fullName.length > 0 ? fullName : '';
};

const propertyDisplayName = (lease: Lease) => {
  return lease.property?.name || '';
};

const toSearchHaystack = (lease: Lease) =>
  `${propertyDisplayName(lease)} ${tenantDisplayName(lease)}`.toLowerCase();

const filterByStatus = (leases: Lease[], includeFinalized: boolean) =>
  includeFinalized
    ? leases.filter((lease) => lease.status === 'ACTIVE' || lease.status === 'FINALIZED')
    : leases.filter((lease) => lease.status === 'ACTIVE');

export default function LeasesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [includeFinalized, setIncludeFinalized] = useState(false);

  const contractTypeLabel = (value: Lease['contractType']) => t(`leases.contractTypes.${value}`);
  const statusLabel = (value: Lease['status']) => t(`leases.status.${value}`);

  const leasesQuery = useQuery({
    queryKey: ['leases', 'list', includeFinalized],
    queryFn: () => leasesApi.getAllWithFilters({ includeFinalized }),
  });

  const filteredLeases = useMemo(() => {
    const fromStatus = filterByStatus(leasesQuery.data ?? [], includeFinalized);
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return fromStatus;
    return fromStatus.filter((lease) => toSearchHaystack(lease).includes(needle));
  }, [leasesQuery.data, includeFinalized, searchTerm]);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View style={styles.headingBlock}>
          <H1>{t('leases.title')}</H1>
          <Text style={styles.subtitle}>{t('leases.subtitle')}</Text>
        </View>
      </View>

      <View style={styles.toolbarRow}>
        <Pressable
          style={styles.checkboxRow}
          onPress={() => setIncludeFinalized((current) => !current)}
          testID="leases.includeFinalized"
        >
          <View style={[styles.checkbox, includeFinalized && styles.checkboxChecked]}>
            {includeFinalized ? <Text style={styles.checkboxTick}>✓</Text> : null}
          </View>
          <Text style={styles.checkboxLabel}>{t('leases.showFinalized')}</Text>
        </Pressable>

        <AppButton
          title={t('leases.manageTemplates')}
          variant="secondary"
          onPress={() => router.push('/(app)/templates' as never)}
          testID="leases.templates"
        />
      </View>

      <TextInput
        value={searchTerm}
        onChangeText={setSearchTerm}
        placeholder={t('leases.searchPlaceholder')}
        style={styles.searchInput}
        autoCapitalize="none"
        testID="leases.search"
      />

      {leasesQuery.isLoading ? <ActivityIndicator /> : null}
      {leasesQuery.error ? <Text style={styles.error}>{(leasesQuery.error as Error).message}</Text> : null}

      <View style={styles.list}>
        {filteredLeases.map((lease) => {
          const isRental = lease.contractType === 'rental';
          const amount = isRental ? Number(lease.rentAmount ?? 0) : Number(lease.fiscalValue ?? 0);
          return (
            <Pressable
              key={lease.id}
              testID={`leases.item.${lease.id}`}
              style={styles.card}
              onPress={() => router.push(`/(app)/leases/${lease.id}` as never)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderText}>
                  <Text style={styles.title}>{propertyDisplayName(lease)}</Text>
                  <Text style={styles.meta}>{contractTypeLabel(lease.contractType)}</Text>
                </View>
                <Text style={[styles.statusBadge, statusStyle(lease.status)]}>{statusLabel(lease.status)}</Text>
              </View>

              <Text style={styles.detail}>{tenantDisplayName(lease)}</Text>
              {isRental ? (
                <Text style={styles.detail}>{`${toDate(lease.startDate)} - ${toDate(lease.endDate)}`}</Text>
              ) : null}
              <Text style={styles.amount}>
                {formatMoney(amount, lease.currency)}
                {isRental ? <Text style={styles.amountSuffix}> {t('leases.perMonth')}</Text> : null}
              </Text>
            </Pressable>
          );
        })}

        {!leasesQuery.isLoading && filteredLeases.length === 0 ? (
          <Text style={styles.empty}>{t('leases.noLeases')}</Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    marginBottom: 8,
  },
  headingBlock: {
    gap: 2,
  },
  subtitle: {
    color: '#64748b',
  },
  toolbarRow: {
    marginBottom: 10,
    gap: 10,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxChecked: {
    backgroundColor: '#1d4ed8',
    borderColor: '#1d4ed8',
  },
  checkboxTick: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  checkboxLabel: {
    color: '#0f172a',
    fontWeight: '600',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    color: '#111827',
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
    gap: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 2,
  },
  cardHeaderText: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontWeight: '700',
    color: '#0f172a',
  },
  meta: {
    color: '#64748b',
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  detail: {
    color: '#475569',
  },
  amount: {
    marginTop: 2,
    color: '#0f172a',
    fontWeight: '700',
  },
  amountSuffix: {
    color: '#64748b',
    fontWeight: '600',
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
  statusActive: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  statusFinalized: {
    backgroundColor: '#e2e8f0',
    color: '#334155',
  },
  statusDraft: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  empty: {
    color: '#475569',
  },
  error: {
    color: '#b91c1c',
    marginBottom: 8,
  },
});

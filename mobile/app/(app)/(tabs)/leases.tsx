import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { leasesApi } from '@/api/leases';
import { Screen } from '@/components/screen';
import { AppButton } from '@/components/ui';
import { i18n } from '@/i18n';
import type { Lease } from '@/types/lease';

function normalizeDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMoney(amount?: number, currencyCode = 'ARS') {
  if (amount === undefined) return '-';
  try {
    return new Intl.NumberFormat(i18n.language || 'es', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount}`;
  }
}

function formatDate(value?: string) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString(i18n.language || 'es');
}

function renewalAlertLabel(lease: Lease): string {
  if (!lease.renewalAlertEnabled) return 'Desactivada';
  if (lease.renewalAlertPeriodicity === 'four_months') return 'Cada 4 meses';
  if (lease.renewalAlertPeriodicity === 'custom') {
    return `${lease.renewalAlertCustomDays ?? '-'} días`;
  }
  return 'Mensual';
}

function LeaseSection({
  title,
  subtitle,
  items,
  onPress,
}: Readonly<{
  title: string;
  subtitle: string;
  items: Lease[];
  onPress: (leaseId: string) => void;
}>) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      {items.length === 0 ? (
        <Text style={styles.empty}>Sin contratos en esta sección.</Text>
      ) : null}
      {items.map((lease) => (
        <Pressable
          key={lease.id}
          style={styles.card}
          onPress={() => onPress(lease.id)}
          testID={`leases.item.${lease.id}`}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderText}>
              <Text style={styles.title}>
                {lease.property?.name ?? 'Propiedad sin nombre'}
              </Text>
              <Text style={styles.meta}>
                {`${lease.tenant?.firstName ?? ''} ${lease.tenant?.lastName ?? ''}`.trim() ||
                  'Sin inquilino'}
              </Text>
            </View>
            <Text style={styles.statusBadge}>{lease.status}</Text>
          </View>

          <Text
            style={styles.detail}
          >{`${formatDate(lease.startDate)} - ${formatDate(lease.endDate)}`}</Text>
          <Text
            style={styles.detail}
          >{`Canon: ${formatMoney(lease.rentAmount, lease.currency)}`}</Text>
          <Text
            style={styles.detail}
          >{`Alerta: ${renewalAlertLabel(lease)}`}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function LeasesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');

  const leasesQuery = useQuery({
    queryKey: ['leases', 'operations', 'rental'],
    queryFn: () =>
      leasesApi.getAllWithFilters({
        includeFinalized: true,
        contractType: 'rental',
      }),
  });

  const filteredLeases = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const source = leasesQuery.data ?? [];
    if (!term) return source;
    return source.filter((lease) =>
      [
        lease.property?.name ?? '',
        lease.tenant?.firstName ?? '',
        lease.tenant?.lastName ?? '',
        lease.property?.address.city ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [leasesQuery.data, searchTerm]);

  const today = useMemo(() => {
    const current = new Date();
    current.setHours(0, 0, 0, 0);
    return current;
  }, []);

  const endOfMonth = useMemo(() => {
    const current = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    current.setHours(23, 59, 59, 999);
    return current;
  }, [today]);

  const nextFourMonths = useMemo(() => {
    const current = new Date(today);
    current.setMonth(current.getMonth() + 4);
    current.setHours(23, 59, 59, 999);
    return current;
  }, [today]);

  const currentRentals = filteredLeases.filter((lease) => {
    const endDate = normalizeDate(lease.endDate);
    return lease.status === 'ACTIVE' && (!endDate || endDate >= today);
  });

  const expiringThisMonth = currentRentals.filter((lease) => {
    const endDate = normalizeDate(lease.endDate);
    return endDate !== null && endDate >= today && endDate <= endOfMonth;
  });

  const expiringNextFourMonths = currentRentals.filter((lease) => {
    const endDate = normalizeDate(lease.endDate);
    return (
      endDate !== null && endDate > endOfMonth && endDate <= nextFourMonths
    );
  });

  const expiredRentals = filteredLeases.filter((lease) => {
    const endDate = normalizeDate(lease.endDate);
    if (!endDate) {
      return lease.status === 'FINALIZED';
    }
    return endDate < today || lease.status === 'FINALIZED';
  });

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('leases.title')}</Text>
        <Text style={styles.headerSubtitle}>
          Vencimientos organizados para renovar a tiempo.
        </Text>
      </View>

      <AppButton
        title={t('leases.manageTemplates')}
        variant="secondary"
        onPress={() => router.push('/(app)/templates' as never)}
        testID="leases.templates"
      />

      <TextInput
        value={searchTerm}
        onChangeText={setSearchTerm}
        placeholder="Buscar por propiedad, inquilino o ciudad"
        style={styles.searchInput}
        autoCapitalize="none"
        testID="leases.search"
      />

      {leasesQuery.isLoading ? <ActivityIndicator /> : null}
      {leasesQuery.error ? (
        <Text style={styles.error}>{(leasesQuery.error as Error).message}</Text>
      ) : null}

      {!leasesQuery.isLoading ? (
        <>
          <LeaseSection
            title="Alquileres vigentes"
            subtitle="Contratos activos con seguimiento diario."
            items={currentRentals}
            onPress={(leaseId) =>
              router.push(`/(app)/leases/${leaseId}` as never)
            }
          />
          <LeaseSection
            title="Vencen este mes"
            subtitle="Prioridad alta para contactar propietarios y renovar."
            items={expiringThisMonth}
            onPress={(leaseId) =>
              router.push(`/(app)/leases/${leaseId}` as never)
            }
          />
          <LeaseSection
            title="Próximos cuatro meses"
            subtitle="Ventana de previsión para coordinar renovaciones."
            items={expiringNextFourMonths}
            onPress={(leaseId) =>
              router.push(`/(app)/leases/${leaseId}` as never)
            }
          />
          <LeaseSection
            title="Alquileres vencidos"
            subtitle="Contratos que requieren regularización o renovación."
            items={expiredRentals}
            onPress={(leaseId) =>
              router.push(`/(app)/leases/${leaseId}` as never)
            }
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 12,
    gap: 4,
  },
  headerTitle: {
    color: '#0f172a',
    fontSize: 28,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#64748b',
  },
  searchInput: {
    marginTop: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    color: '#111827',
  },
  section: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 20,
    padding: 14,
    backgroundColor: '#ffffff',
    gap: 8,
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: '#64748b',
    fontSize: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#f8fafc',
    gap: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardHeaderText: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#0f172a',
    fontWeight: '700',
  },
  meta: {
    color: '#475569',
    fontSize: 12,
  },
  detail: {
    color: '#334155',
    fontSize: 12,
  },
  statusBadge: {
    color: '#1e3a8a',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    fontWeight: '700',
    fontSize: 11,
    overflow: 'hidden',
  },
  empty: {
    color: '#64748b',
  },
  error: {
    color: '#b91c1c',
    marginBottom: 8,
  },
});

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
import { paymentsApi } from '@/api/payments';
import { propertiesApi } from '@/api/properties';
import { Screen } from '@/components/screen';
import { AppButton, ChoiceGroup } from '@/components/ui';
import { i18n } from '@/i18n';
import type { Lease } from '@/types/lease';
import type {
  Payment,
  PaymentActivityType,
  PaymentStatus,
} from '@/types/payment';
import type { Property } from '@/types/property';

type StatusFilter = 'all' | PaymentStatus;
type ActivityFilter = 'all' | PaymentActivityType;

function formatAmount(payment: Payment) {
  try {
    return new Intl.NumberFormat(i18n.language || 'es', {
      style: 'currency',
      currency: payment.currencyCode || 'ARS',
      maximumFractionDigits: 0,
    }).format(payment.amount);
  } catch {
    return `${payment.currencyCode} ${payment.amount}`;
  }
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString(i18n.language || 'es');
}

function activityTypeLabel(value: PaymentActivityType): string {
  if (value === 'annual') return 'Anual';
  if (value === 'adjustment') return 'Ajuste';
  if (value === 'late_fee') return 'Mora';
  if (value === 'extraordinary') return 'Extraordinario';
  return 'Mensual';
}

function statusLabel(value: PaymentStatus): string {
  if (value === 'completed') return 'Realizado';
  if (value === 'processing') return 'Procesando';
  if (value === 'failed') return 'Fallido';
  if (value === 'refunded') return 'Reintegrado';
  if (value === 'cancelled') return 'Cancelado';
  return 'Pendiente';
}

function statusStyle(status: PaymentStatus) {
  if (status === 'completed') return styles.statusCompleted;
  if (status === 'pending') return styles.statusPending;
  if (status === 'processing') return styles.statusProcessing;
  if (status === 'failed') return styles.statusFailed;
  if (status === 'refunded') return styles.statusRefunded;
  return styles.statusCancelled;
}

function getPaymentContext(
  payment: Payment,
  leasesById: Record<string, Lease>,
  propertiesById: Record<string, Property>,
) {
  const leaseFromRelation = payment.tenantAccount?.lease;
  const leaseFromAccountId = payment.tenantAccount?.leaseId
    ? leasesById[payment.tenantAccount.leaseId]
    : undefined;
  const lease = leaseFromRelation ?? leaseFromAccountId;
  const property =
    lease?.property ??
    (lease?.propertyId ? propertiesById[lease.propertyId] : undefined);
  const tenantName =
    `${lease?.tenant?.firstName ?? ''} ${lease?.tenant?.lastName ?? ''}`.trim() ||
    'Sin inquilino';

  return {
    propertyName: property?.name ?? 'Sin propiedad',
    leaseLabel: lease?.id ?? 'Sin contrato',
    tenantName,
  };
}

function FilterSection({
  title,
  options,
  value,
  onChange,
}: Readonly<{
  title: string;
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (next: string) => void;
}>) {
  return (
    <View style={styles.filterSection}>
      <Text style={styles.filterTitle}>{title}</Text>
      <View style={styles.chipRow}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              style={[styles.filterChip, selected && styles.filterChipSelected]}
              onPress={() => onChange(option.value)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selected && styles.filterChipTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'neutral',
}: Readonly<{
  label: string;
  value: number | string;
  tone?: 'neutral' | 'warning' | 'success';
}>) {
  return (
    <View
      style={[
        styles.summaryCard,
        tone === 'warning' && styles.summaryCardWarning,
        tone === 'success' && styles.summaryCardSuccess,
      ]}
    >
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

export default function PaymentsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [leaseFilter, setLeaseFilter] = useState<string>('all');

  const propertiesQuery = useQuery({
    queryKey: ['properties'],
    queryFn: propertiesApi.getAll,
  });

  const leasesQuery = useQuery({
    queryKey: ['leases', 'payments-selector'],
    queryFn: () =>
      leasesApi.getAllWithFilters({
        includeFinalized: true,
        contractType: 'rental',
      }),
  });

  const paymentsQuery = useQuery({
    queryKey: [
      'payments',
      'operations',
      propertyFilter,
      leaseFilter,
      statusFilter,
      activityFilter,
    ],
    queryFn: () =>
      paymentsApi.getAllWithFilters({
        propertyId: propertyFilter === 'all' ? undefined : propertyFilter,
        leaseId: leaseFilter === 'all' ? undefined : leaseFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
        activityType: activityFilter === 'all' ? undefined : activityFilter,
      }),
  });

  const propertiesById = useMemo(
    () =>
      Object.fromEntries(
        (propertiesQuery.data ?? []).map((property) => [property.id, property]),
      ),
    [propertiesQuery.data],
  );
  const leasesById = useMemo(
    () =>
      Object.fromEntries(
        (leasesQuery.data ?? []).map((lease) => [lease.id, lease]),
      ),
    [leasesQuery.data],
  );

  const selectedPropertyLeases = useMemo(() => {
    if (propertyFilter === 'all') {
      return leasesQuery.data ?? [];
    }
    return (leasesQuery.data ?? []).filter(
      (lease) => lease.propertyId === propertyFilter,
    );
  }, [leasesQuery.data, propertyFilter]);

  const filteredPayments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const items = paymentsQuery.data?.data ?? [];
    if (!term) return items;
    return items.filter((payment) => {
      const context = getPaymentContext(payment, leasesById, propertiesById);
      return [
        context.propertyName,
        context.tenantName,
        context.leaseLabel,
        payment.reference ?? '',
        payment.receipt?.receiptNumber ?? '',
        activityTypeLabel(payment.activityType),
      ]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [leasesById, paymentsQuery.data?.data, propertiesById, searchTerm]);

  const loading =
    paymentsQuery.isLoading ||
    leasesQuery.isLoading ||
    propertiesQuery.isLoading;
  const error =
    paymentsQuery.error ?? leasesQuery.error ?? propertiesQuery.error;

  const statusOptions: Array<{ label: string; value: StatusFilter }> = [
    { label: 'Todos', value: 'all' },
    { label: 'Pendientes', value: 'pending' },
    { label: 'Realizados', value: 'completed' },
    { label: 'Procesando', value: 'processing' },
    { label: 'Fallidos', value: 'failed' },
  ];

  const activityOptions: Array<{ label: string; value: ActivityFilter }> = [
    { label: 'Todas', value: 'all' },
    { label: 'Mensual', value: 'monthly' },
    { label: 'Anual', value: 'annual' },
    { label: 'Ajuste', value: 'adjustment' },
    { label: 'Mora', value: 'late_fee' },
    { label: 'Extra', value: 'extraordinary' },
  ];

  const propertyOptions = [
    { label: 'Todas', value: 'all' },
    ...(propertiesQuery.data ?? []).map((property) => ({
      label: property.name,
      value: property.id,
    })),
  ];

  const leaseOptions = [
    { label: 'Todos', value: 'all' },
    ...selectedPropertyLeases.map((lease) => ({
      label:
        lease.property?.name && lease.tenant
          ? `${lease.property.name} · ${lease.tenant.firstName ?? ''} ${lease.tenant.lastName ?? ''}`.trim()
          : lease.id,
      value: lease.id,
    })),
  ];

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>
          Sistema de Gestión Inmobiliaria
        </Text>
        <Text style={styles.headerTitle}>{t('payments.title')}</Text>
        <Text style={styles.headerSubtitle}>
          Cobros por propiedad, contrato, actividad y estado.
        </Text>
      </View>

      <AppButton
        title={t('payments.newPayment')}
        onPress={() => router.push('/(app)/payments/new' as never)}
        testID="payments.new"
      />

      <TextInput
        value={searchTerm}
        onChangeText={setSearchTerm}
        placeholder="Buscar por propiedad, inquilino, contrato o referencia"
        style={styles.searchInput}
        autoCapitalize="none"
        testID="payments.search"
      />

      <FilterSection
        title="Propiedad"
        options={propertyOptions}
        value={propertyFilter}
        onChange={(next) => {
          setPropertyFilter(next);
          setLeaseFilter('all');
        }}
      />

      <FilterSection
        title="Contrato"
        options={leaseOptions}
        value={leaseFilter}
        onChange={setLeaseFilter}
      />

      <ChoiceGroup
        label={t('common.filter')}
        value={statusFilter}
        onChange={setStatusFilter}
        options={statusOptions}
        testID="payments.status"
      />

      <ChoiceGroup
        label="Actividad"
        value={activityFilter}
        onChange={setActivityFilter}
        options={activityOptions}
        testID="payments.activity"
      />

      {loading ? <ActivityIndicator /> : null}
      {error ? <Text style={styles.error}>{error.message}</Text> : null}

      {loading ? null : (
        <>
          <View style={styles.summaryGrid}>
            <SummaryCard label="Listados" value={filteredPayments.length} />
            <SummaryCard
              label="Pendientes"
              value={
                filteredPayments.filter(
                  (payment) => payment.status === 'pending',
                ).length
              }
              tone="warning"
            />
            <SummaryCard
              label="Realizados"
              value={
                filteredPayments.filter(
                  (payment) => payment.status === 'completed',
                ).length
              }
              tone="success"
            />
          </View>

          <View style={styles.list}>
            {filteredPayments.map((payment) => {
              const context = getPaymentContext(
                payment,
                leasesById,
                propertiesById,
              );
              return (
                <View
                  key={payment.id}
                  style={styles.card}
                  testID={`payments.item.${payment.id}`}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderText}>
                      <Text style={styles.cardTitle}>
                        {context.propertyName}
                      </Text>
                      <Text style={styles.cardMeta}>{context.tenantName}</Text>
                      <Text
                        style={styles.cardMeta}
                      >{`Contrato: ${context.leaseLabel}`}</Text>
                    </View>
                    <Text style={styles.amount}>{formatAmount(payment)}</Text>
                  </View>

                  <Text
                    style={styles.cardMeta}
                  >{`${activityTypeLabel(payment.activityType)} · ${formatDate(payment.paymentDate)}`}</Text>
                  <Text
                    style={styles.cardMeta}
                  >{`${payment.method} · ${statusLabel(payment.status)}`}</Text>
                  {payment.reference ? (
                    <Text style={styles.cardMeta}>{payment.reference}</Text>
                  ) : null}

                  <View style={styles.actionsRow}>
                    <Pressable
                      style={[styles.statusBadge, statusStyle(payment.status)]}
                      onPress={() =>
                        router.push(`/(app)/payments/${payment.id}` as never)
                      }
                    >
                      <Text style={styles.statusText}>
                        {statusLabel(payment.status)}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.viewPill}
                      onPress={() =>
                        router.push(`/(app)/payments/${payment.id}` as never)
                      }
                    >
                      <Text style={styles.viewPillText}>
                        {t('common.view')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}

            {filteredPayments.length === 0 ? (
              <Text style={styles.empty}>
                No hay pagos para los filtros seleccionados.
              </Text>
            ) : null}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 12,
    gap: 4,
  },
  headerEyebrow: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
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
  filterSection: {
    marginBottom: 12,
    gap: 8,
  },
  filterTitle: {
    color: '#1f2937',
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  filterChipSelected: {
    borderColor: '#1d4ed8',
    backgroundColor: '#dbeafe',
  },
  filterChipText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 12,
  },
  filterChipTextSelected: {
    color: '#1e40af',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  summaryCard: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 12,
    backgroundColor: '#ffffff',
  },
  summaryCardWarning: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
  },
  summaryCardSuccess: {
    backgroundColor: '#ecfdf5',
    borderColor: '#86efac',
  },
  summaryLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  summaryValue: {
    marginTop: 6,
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '800',
  },
  list: {
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 6,
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
  cardTitle: {
    color: '#0f172a',
    fontWeight: '700',
  },
  cardMeta: {
    color: '#475569',
    fontSize: 12,
  },
  amount: {
    color: '#15803d',
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPending: {
    backgroundColor: '#fef3c7',
  },
  statusProcessing: {
    backgroundColor: '#dbeafe',
  },
  statusCompleted: {
    backgroundColor: '#dcfce7',
  },
  statusFailed: {
    backgroundColor: '#fee2e2',
  },
  statusRefunded: {
    backgroundColor: '#ede9fe',
  },
  statusCancelled: {
    backgroundColor: '#e2e8f0',
  },
  statusText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 12,
  },
  viewPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#93c5fd',
    backgroundColor: '#eff6ff',
  },
  viewPillText: {
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: 12,
  },
  empty: {
    color: '#64748b',
  },
  error: {
    color: '#b91c1c',
    marginBottom: 8,
  },
});

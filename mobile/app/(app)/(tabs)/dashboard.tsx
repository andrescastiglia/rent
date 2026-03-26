import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  dashboardApi,
  type DashboardLeaseOperationItem,
  type DashboardPaymentOperationItem,
  type DashboardSalePropertyItem,
  type PersonActivityItem,
} from '@/api/dashboard';
import { Screen } from '@/components/screen';
import { i18n } from '@/i18n';

function formatMoney(
  amount: number | null | undefined,
  currencyCode: string,
): string {
  if (amount === null || amount === undefined) return '-';
  try {
    return new Intl.NumberFormat(i18n.language || 'es', {
      style: 'currency',
      currency: currencyCode || 'ARS',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount}`;
  }
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString(i18n.language || 'es');
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString(i18n.language || 'es', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function periodicityLabel(value?: string): string {
  if (value === 'four_months') return 'Cada 4 meses';
  if (value === 'custom') return 'Personalizada';
  return 'Mensual';
}

function activityTypeLabel(value?: string): string {
  if (value === 'annual') return 'Anual';
  if (value === 'adjustment') return 'Ajuste';
  if (value === 'late_fee') return 'Mora';
  if (value === 'extraordinary') return 'Extraordinario';
  return 'Mensual';
}

function ActionPill({
  title,
  onPress,
  variant = 'light',
}: Readonly<{
  title: string;
  onPress: () => void;
  variant?: 'light' | 'dark';
}>) {
  return (
    <Pressable
      style={[styles.actionPill, variant === 'dark' && styles.actionPillDark]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.actionPillText,
          variant === 'dark' && styles.actionPillTextDark,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

function MetricTile({
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
        styles.metricTile,
        tone === 'warning' && styles.metricTileWarning,
        tone === 'success' && styles.metricTileSuccess,
      ]}
    >
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function SaleCard({ item }: Readonly<{ item: DashboardSalePropertyItem }>) {
  return (
    <View style={styles.itemCard}>
      <Text style={styles.itemTitle}>{item.propertyName}</Text>
      <Text style={styles.itemMeta}>{item.ownerName ?? 'Sin propietario'}</Text>
      {item.propertyAddress ? (
        <Text style={styles.itemMeta}>{item.propertyAddress}</Text>
      ) : null}
      <Text style={styles.itemStrong}>
        {formatMoney(item.salePrice, item.saleCurrency)}
      </Text>
    </View>
  );
}

function LeaseCard({
  item,
  emphasis,
}: Readonly<{
  item: DashboardLeaseOperationItem;
  emphasis?: 'warning' | 'danger';
}>) {
  return (
    <View
      style={[
        styles.itemCard,
        emphasis === 'warning' && styles.itemCardWarning,
        emphasis === 'danger' && styles.itemCardDanger,
      ]}
    >
      <Text style={styles.itemTitle}>
        {item.propertyName ?? 'Propiedad sin nombre'}
      </Text>
      <Text style={styles.itemMeta}>{item.tenantName ?? 'Sin inquilino'}</Text>
      <Text style={styles.itemMeta}>{`Fin: ${formatDate(item.endDate)}`}</Text>
      <Text
        style={styles.itemMeta}
      >{`Alerta: ${item.renewalAlertEnabled ? periodicityLabel(item.renewalAlertPeriodicity) : 'Desactivada'}`}</Text>
    </View>
  );
}

function PaymentCard({
  item,
}: Readonly<{ item: DashboardPaymentOperationItem }>) {
  return (
    <View style={styles.itemCard}>
      <View style={styles.rowBetween}>
        <Text style={styles.itemTitle}>
          {item.propertyName ?? 'Sin propiedad'}
        </Text>
        <Text style={styles.itemStrong}>
          {formatMoney(item.amount, item.currencyCode)}
        </Text>
      </View>
      <Text style={styles.itemMeta}>{item.tenantName ?? 'Sin inquilino'}</Text>
      <Text
        style={styles.itemMeta}
      >{`${activityTypeLabel(item.activityType)} · ${formatDate(item.paymentDate)}`}</Text>
      <Text style={styles.itemMeta}>{`Estado: ${item.status}`}</Text>
    </View>
  );
}

function ActivitySection({
  title,
  items,
  emptyLabel,
}: Readonly<{
  title: string;
  items: PersonActivityItem[];
  emptyLabel: string;
}>) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.length === 0 ? (
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      ) : null}
      {items.map((item) => (
        <View key={item.id} style={styles.activityCard}>
          <Text style={styles.itemTitle}>{item.personName}</Text>
          <Text style={styles.itemMeta}>{item.subject}</Text>
          {item.body ? <Text style={styles.itemMeta}>{item.body}</Text> : null}
          <Text
            style={styles.itemMeta}
          >{`${item.sourceType}${item.propertyName ? ` · ${item.propertyName}` : ''}`}</Text>
          <Text
            style={styles.itemMeta}
          >{`Vence: ${formatDateTime(item.dueAt)}`}</Text>
        </View>
      ))}
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const overviewQuery = useQuery({
    queryKey: ['dashboard', 'operations-overview'],
    queryFn: dashboardApi.getOperationsOverview,
  });

  const activityQuery = useQuery({
    queryKey: ['dashboard', 'recent-activity', 25],
    queryFn: () => dashboardApi.getRecentActivity(25),
  });

  const overview = overviewQuery.data;
  const peopleActivity = activityQuery.data;
  const propertyPanel = overview?.propertiesPanel;
  const paymentsPanel = overview?.paymentsPanel;
  const loading = overviewQuery.isLoading || activityQuery.isLoading;
  const error = overviewQuery.error ?? activityQuery.error;

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>Sistema de Gestión Inmobiliaria</Text>
        <Text style={styles.heroTitle}>{t('dashboard.title')}</Text>
        <Text style={styles.heroText}>
          Acceso operativo dividido en Propiedades y Pagos, con vencimientos y
          seguimiento diario.
        </Text>
      </View>

      {loading ? (
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      ) : null}
      {error ? (
        <Text style={styles.error}>{(error as Error).message}</Text>
      ) : null}

      {propertyPanel ? (
        <View style={styles.panelCard}>
          <View style={styles.panelHeaderDark}>
            <Text style={styles.panelEyebrow}>Panel principal</Text>
            <Text style={styles.panelTitleDark}>Propiedades</Text>
            <Text style={styles.panelTextDark}>
              Ventas, alquileres vigentes y contratos por vencer.
            </Text>
            <View style={styles.actionsRow}>
              <ActionPill
                title="Ver propiedades"
                variant="dark"
                onPress={() => router.push('/(app)/(tabs)/properties' as never)}
              />
              <ActionPill
                title="Ver alquileres"
                variant="dark"
                onPress={() => router.push('/(app)/(tabs)/leases' as never)}
              />
            </View>
          </View>

          <View style={styles.metricsGrid}>
            <MetricTile label="Total" value={propertyPanel.totalProperties} />
            <MetricTile label="Venta" value={propertyPanel.saleCount} />
            <MetricTile
              label="Vigentes"
              value={propertyPanel.rentalActiveCount}
              tone="success"
            />
            <MetricTile
              label="Vencidos"
              value={propertyPanel.rentalExpiredCount}
              tone="warning"
            />
            <MetricTile
              label="Este mes"
              value={propertyPanel.expiringThisMonthCount}
              tone="warning"
            />
            <MetricTile
              label="4 meses"
              value={propertyPanel.expiringNextFourMonthsCount}
            />
          </View>

          <View style={styles.innerSection}>
            <Text style={styles.sectionTitle}>Venta</Text>
            {propertyPanel.saleHighlights.length === 0 ? (
              <Text style={styles.emptyText}>
                No hay propiedades destacadas en venta.
              </Text>
            ) : null}
            {propertyPanel.saleHighlights.slice(0, 3).map((item) => (
              <SaleCard key={item.propertyId} item={item} />
            ))}
          </View>

          <View style={styles.innerSection}>
            <Text style={styles.sectionTitle}>Vencen este mes</Text>
            {propertyPanel.expiringThisMonth.length === 0 ? (
              <Text style={styles.emptyText}>
                No hay vencimientos este mes.
              </Text>
            ) : null}
            {propertyPanel.expiringThisMonth.slice(0, 3).map((item) => (
              <LeaseCard key={item.leaseId} item={item} emphasis="warning" />
            ))}
          </View>

          <View style={styles.innerSection}>
            <Text style={styles.sectionTitle}>Próximos cuatro meses</Text>
            {propertyPanel.expiringNextFourMonths.length === 0 ? (
              <Text style={styles.emptyText}>
                No hay vencimientos próximos.
              </Text>
            ) : null}
            {propertyPanel.expiringNextFourMonths.slice(0, 3).map((item) => (
              <LeaseCard key={item.leaseId} item={item} />
            ))}
          </View>

          <View style={styles.innerSection}>
            <Text style={styles.sectionTitle}>Alquileres vencidos</Text>
            {propertyPanel.expiredRentals.length === 0 ? (
              <Text style={styles.emptyText}>No hay alquileres vencidos.</Text>
            ) : null}
            {propertyPanel.expiredRentals.slice(0, 3).map((item) => (
              <LeaseCard key={item.leaseId} item={item} emphasis="danger" />
            ))}
          </View>
        </View>
      ) : null}

      {paymentsPanel ? (
        <View style={styles.panelCard}>
          <View style={styles.panelHeaderLight}>
            <Text style={styles.panelEyebrowLight}>Panel principal</Text>
            <Text style={styles.panelTitleLight}>Pagos</Text>
            <Text style={styles.panelTextLight}>
              Cobros por propiedad y contrato con seguimiento del estado.
            </Text>
            <View style={styles.actionsRow}>
              <ActionPill
                title="Ver pagos"
                onPress={() => router.push('/(app)/(tabs)/payments' as never)}
              />
              <ActionPill
                title="Registrar pago"
                onPress={() => router.push('/(app)/payments/new' as never)}
              />
            </View>
          </View>

          <View style={styles.metricsGrid}>
            <MetricTile label="Total" value={paymentsPanel.totalPayments} />
            <MetricTile
              label="Pendientes"
              value={paymentsPanel.pendingPayments}
              tone="warning"
            />
            <MetricTile
              label="Realizados"
              value={paymentsPanel.completedPayments}
              tone="success"
            />
            <MetricTile
              label="Facturas vencidas"
              value={paymentsPanel.overdueInvoices}
              tone="warning"
            />
          </View>

          <View style={styles.innerSection}>
            <Text style={styles.sectionTitle}>Pagos recientes</Text>
            {paymentsPanel.recentPayments.length === 0 ? (
              <Text style={styles.emptyText}>No hay pagos recientes.</Text>
            ) : null}
            {paymentsPanel.recentPayments.slice(0, 5).map((item) => (
              <PaymentCard key={item.paymentId} item={item} />
            ))}
          </View>
        </View>
      ) : null}

      <ActivitySection
        title={t('dashboard.peopleActivity.overdueTitle')}
        items={peopleActivity?.overdue ?? []}
        emptyLabel={t('dashboard.peopleActivity.noOverdue')}
      />
      <ActivitySection
        title={t('dashboard.peopleActivity.todayTitle')}
        items={peopleActivity?.today ?? []}
        emptyLabel={t('dashboard.peopleActivity.noToday')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  heroEyebrow: {
    color: '#9a3412',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroTitle: {
    marginTop: 6,
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  heroText: {
    marginTop: 8,
    color: '#7c2d12',
    lineHeight: 20,
  },
  loadingText: {
    color: '#475569',
    marginBottom: 8,
  },
  panelCard: {
    marginBottom: 16,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  panelHeaderDark: {
    padding: 16,
    backgroundColor: '#0f172a',
  },
  panelHeaderLight: {
    padding: 16,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  panelEyebrow: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  panelEyebrowLight: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  panelTitleDark: {
    marginTop: 6,
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
  },
  panelTitleLight: {
    marginTop: 6,
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '800',
  },
  panelTextDark: {
    marginTop: 6,
    color: '#cbd5e1',
  },
  panelTextLight: {
    marginTop: 6,
    color: '#475569',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 16,
  },
  metricTile: {
    width: '48%',
    borderRadius: 16,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  metricTileWarning: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
  },
  metricTileSuccess: {
    backgroundColor: '#ecfdf5',
    borderColor: '#86efac',
  },
  metricLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  metricValue: {
    marginTop: 6,
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '800',
  },
  innerSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  sectionCard: {
    marginBottom: 16,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    gap: 8,
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },
  itemCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 12,
    backgroundColor: '#f8fafc',
    gap: 4,
  },
  itemCardWarning: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
  },
  itemCardDanger: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
  },
  itemTitle: {
    color: '#0f172a',
    fontWeight: '700',
  },
  itemMeta: {
    color: '#475569',
    fontSize: 12,
  },
  itemStrong: {
    color: '#111827',
    fontWeight: '800',
  },
  activityCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#f8fafc',
    gap: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  actionPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  actionPillDark: {
    borderColor: '#334155',
    backgroundColor: '#1e293b',
  },
  actionPillText: {
    color: '#1e293b',
    fontWeight: '700',
    fontSize: 12,
  },
  actionPillTextDark: {
    color: '#ffffff',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  emptyText: {
    color: '#64748b',
  },
  error: {
    color: '#b91c1c',
    marginBottom: 8,
  },
});

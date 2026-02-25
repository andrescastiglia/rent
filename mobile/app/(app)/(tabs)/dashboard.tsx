import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { PersonActivityItem, PersonActivityStatus } from '@/api/dashboard';
import { dashboardApi } from '@/api/dashboard';
import { Screen } from '@/components/screen';
import { H1 } from '@/components/ui';
import { i18n } from '@/i18n';

export default function DashboardScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const statsQuery = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: dashboardApi.getStats,
  });

  const activityQuery = useQuery({
    queryKey: ['dashboard', 'recent-activity', 25],
    queryFn: () => dashboardApi.getRecentActivity(25),
  });

  const stats = statsQuery.data;
  const peopleActivity = activityQuery.data;
  const loading = statsQuery.isLoading || activityQuery.isLoading;
  const error = statsQuery.error ?? activityQuery.error;

  return (
    <Screen>
      <H1>{t('dashboard.title')}</H1>
      {loading ? <Text>{t('common.loading')}</Text> : null}
      {error ? <Text style={styles.error}>{(error as Error).message}</Text> : null}

      {stats ? (
        <View style={styles.grid}>
          <StatCard
            label={t('dashboard.stats.properties')}
            value={stats.totalProperties}
            testID="dashboard.stat.properties"
            onPress={() => router.push('/(app)/(tabs)/properties')}
          />
          <StatCard
            label={t('dashboard.stats.tenants')}
            value={stats.totalTenants}
            testID="dashboard.stat.tenants"
            onPress={() => router.push('/(app)/(tabs)/tenants')}
          />
          <StatCard
            label={t('dashboard.stats.monthlyIncome')}
            value={formatMoney(stats.monthlyIncome, stats.currencyCode)}
            testID="dashboard.stat.monthlyIncome"
          />
          <StatCard
            label={t('dashboard.stats.monthlyExpenses')}
            value={`-${formatMoney(Math.abs(stats.monthlyExpenses), stats.currencyCode)}`}
            valueStyle={styles.expenseValue}
            testID="dashboard.stat.monthlyExpenses"
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('dashboard.peopleActivity.overdueTitle')}</Text>
        {renderActivities(peopleActivity?.overdue ?? [], t('dashboard.peopleActivity.noOverdue'), t)}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('dashboard.peopleActivity.todayTitle')}</Text>
        {renderActivities(peopleActivity?.today ?? [], t('dashboard.peopleActivity.noToday'), t)}
      </View>
    </Screen>
  );
}

function formatMoney(amount: number, currencyCode: string): string {
  return new Intl.NumberFormat(i18n.language || 'es', {
    style: 'currency',
    currency: currencyCode || 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString(i18n.language || 'es', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function statusLabel(t: (key: string) => string, status: PersonActivityStatus): string {
  return t(`dashboard.peopleActivity.statuses.${status}`);
}

function renderActivities(
  items: PersonActivityItem[],
  emptyLabel: string,
  t: (key: string) => string,
) {
  if (items.length === 0) {
    return <Text style={styles.emptyText}>{emptyLabel}</Text>;
  }

  return (
    <View style={styles.activitiesList}>
      {items.map((item) => (
        <View key={item.id} style={styles.activityCard}>
          <Text style={styles.activityTitle}>{item.personName}</Text>
          <Text style={styles.activityMeta}>{`${item.sourceType}${item.propertyName ? ` · ${item.propertyName}` : ''}`}</Text>
          <Text style={styles.activitySubject}>{item.subject}</Text>
          {item.body ? <Text style={styles.activityBody}>{item.body}</Text> : null}
          <Text style={styles.activityMeta}>{`${t('tenants.activities.dueAt')}: ${formatDateTime(item.dueAt)}`}</Text>
          <Text style={styles.activityStatus}>{`${t('dashboard.activity.columns.status')}: ${statusLabel(t, item.status)}`}</Text>
        </View>
      ))}
    </View>
  );
}

function StatCard({
  label,
  value,
  valueStyle,
  testID,
  onPress,
}: Readonly<{
  label: string;
  value: number | string;
  valueStyle?: object;
  testID?: string;
  onPress?: () => void;
}>) {
  return (
    <Pressable style={styles.card} testID={testID} onPress={onPress} disabled={!onPress}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={[styles.cardValue, valueStyle]}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: 12,
    marginBottom: 20,
  },
  card: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  cardLabel: {
    color: '#64748b',
    marginBottom: 6,
  },
  cardValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  expenseValue: {
    color: '#b91c1c',
  },
  section: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  activitiesList: {
    gap: 8,
  },
  activityCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#f8fafc',
  },
  activityTitle: {
    color: '#0f172a',
    fontWeight: '700',
  },
  activitySubject: {
    color: '#1f2937',
    marginTop: 4,
    fontWeight: '600',
  },
  activityBody: {
    color: '#475569',
    marginTop: 4,
  },
  activityMeta: {
    color: '#64748b',
    marginTop: 4,
    fontSize: 12,
  },
  activityStatus: {
    color: '#334155',
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  emptyText: {
    color: '#64748b',
  },
  error: {
    color: '#b91c1c',
    marginBottom: 8,
  },
});

import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ownersApi } from '@/api/owners';
import { propertiesApi } from '@/api/properties';
import { Screen } from '@/components/screen';
import { AppButton, H1 } from '@/components/ui';
import { i18n } from '@/i18n';

const formatMoney = (amount?: number, currencyCode = 'ARS'): string =>
  amount === undefined
    ? '-'
    : new Intl.NumberFormat(i18n.language || 'es', { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 }).format(
        amount,
      );

const formatTaskDate = (value?: string): string => {
  if (!value) {
    return '-';
  }

  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toLocaleString(i18n.language || 'es');
  }

  const normalized = new Date(value.replace(' ', 'T'));
  if (!Number.isNaN(normalized.getTime())) {
    return normalized.toLocaleString(i18n.language || 'es');
  }

  return '-';
};

export default function PropertyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();

  const query = useQuery({
    queryKey: ['properties', id],
    queryFn: () => propertiesApi.getById(id),
    enabled: Boolean(id),
  });
  const maintenanceQuery = useQuery({
    queryKey: ['properties', id, 'maintenance'],
    queryFn: () => propertiesApi.getMaintenanceTasks(id, 5),
    enabled: Boolean(id),
  });
  const ownerQuery = useQuery({
    queryKey: ['owners', 'by-id', query.data?.ownerId],
    queryFn: () => ownersApi.getById(query.data?.ownerId ?? ''),
    enabled: Boolean(query.data?.ownerId),
  });

  const property = query.data;

  return (
    <Screen>
      <H1>{t('properties.propertyDetails')}</H1>
      {query.isLoading ? <Text>{t('common.loading')}</Text> : null}
      {query.error ? <Text style={styles.error}>{(query.error as Error).message}</Text> : null}
      {!query.isLoading && !property ? <Text>{t('properties.notFound')}</Text> : null}

      {property ? (
        <View style={styles.card}>
          <Text style={styles.title}>{property.name}</Text>
          <Text style={styles.detail}>{property.description ?? t('properties.noDescription')}</Text>
          <Text style={styles.detail}>{`${property.address.street} ${property.address.number}`}</Text>
          <Text style={styles.detail}>{`${property.address.city}, ${property.address.state}`}</Text>
          <Text style={styles.detail}>{`${property.type} · ${property.status}`}</Text>
          <Text style={styles.detail}>
            {`${t('leases.fields.owner')}: ${
              ownerQuery.data ? `${ownerQuery.data.firstName} ${ownerQuery.data.lastName}`.trim() || ownerQuery.data.email : '-'
            }`}
          </Text>
          <Text style={styles.detail}>{`${t('properties.fields.rentPrice')}: ${formatMoney(property.rentPrice, 'ARS')}`}</Text>
          <Text style={styles.detail}>{`${t('properties.fields.salePrice')}: ${formatMoney(property.salePrice, property.saleCurrency ?? 'ARS')}`}</Text>
        </View>
      ) : null}

      {property ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('properties.recentMaintenanceTasks')}</Text>
          {maintenanceQuery.isLoading ? <Text style={styles.detail}>{t('common.loading')}</Text> : null}
          {maintenanceQuery.error ? (
            <Text style={styles.error}>{t('messages.loadError')}</Text>
          ) : null}
          {!maintenanceQuery.isLoading && !maintenanceQuery.error && (maintenanceQuery.data ?? []).length === 0 ? (
            <Text style={styles.detail}>{t('properties.noMaintenanceTasks')}</Text>
          ) : null}
          {(maintenanceQuery.data ?? []).map((task) => (
            <View key={task.id} style={styles.taskRow}>
              <Text style={styles.taskTitle}>{task.title}</Text>
              <Text style={styles.detail}>{formatTaskDate(task.scheduledAt)}</Text>
              {task.notes ? <Text style={styles.detail}>{task.notes}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      {property ? (
        <View style={styles.actions}>
          <AppButton
            title={t('properties.saveMaintenanceTask')}
            variant="secondary"
            onPress={() => router.push(`/(app)/properties/${property.id}/maintenance/new`)}
            testID="propertyDetail.maintenance"
          />
          <AppButton
            title={t('common.edit')}
            onPress={() => router.push(`/(app)/properties/${property.id}/edit`)}
            testID="propertyDetail.edit"
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
  sectionTitle: {
    color: '#0f172a',
    fontWeight: '700',
    marginBottom: 2,
  },
  taskRow: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    padding: 8,
    gap: 2,
  },
  taskTitle: {
    color: '#0f172a',
    fontWeight: '700',
  },
  actions: {
    marginTop: 16,
    gap: 10,
  },
  error: {
    color: '#b91c1c',
  },
});

import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ownersApi } from '@/api/owners';
import { propertiesApi } from '@/api/properties';
import { Screen } from '@/components/screen';
import { AppButton } from '@/components/ui';
import { i18n } from '@/i18n';
import type {
  Property,
  PropertyMaintenanceTask,
  PropertyVisit,
} from '@/types/property';

const formatMoney = (amount?: number, currencyCode = 'ARS'): string =>
  amount === undefined
    ? '-'
    : new Intl.NumberFormat(i18n.language || 'es', {
        style: 'currency',
        currency: currencyCode,
        maximumFractionDigits: 0,
      }).format(amount);

const formatDateTime = (value?: string): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString(i18n.language || 'es');
  }

  const normalized = new Date(value.replace(' ', 'T'));
  if (!Number.isNaN(normalized.getTime())) {
    return normalized.toLocaleString(i18n.language || 'es');
  }

  return '-';
};

const getOwnerDisplayName = (
  firstName?: string,
  lastName?: string,
  email?: string,
) => `${firstName ?? ''} ${lastName ?? ''}`.trim() || email || '-';

const getQueryErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : i18n.t('messages.loadError');

type PropertySummaryCardProps = Readonly<{
  ownerName: string;
  property: Property;
  t: (key: string, options?: Record<string, unknown>) => string;
}>;

function PropertySummaryCard({
  ownerName,
  property,
  t,
}: PropertySummaryCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{property.name}</Text>
      <Text style={styles.detail}>
        {property.description ?? t('properties.noDescription')}
      </Text>
      <Text
        style={styles.detail}
      >{`${property.address.street} ${property.address.number}, ${property.address.city}`}</Text>
      <Text
        style={styles.detail}
      >{`${property.type} · ${property.status}`}</Text>
      {property.operations?.length ? (
        <Text
          style={styles.detail}
        >{`Operaciones: ${property.operations.join(', ')}`}</Text>
      ) : null}
      <Text
        style={styles.detail}
      >{`${t('leases.fields.owner')}: ${ownerName}`}</Text>
      {property.ownerWhatsapp ? (
        <Text
          style={styles.detail}
        >{`WhatsApp propietario: ${property.ownerWhatsapp}`}</Text>
      ) : null}
      <Text
        style={styles.detail}
      >{`${t('properties.fields.rentPrice')}: ${formatMoney(property.rentPrice, 'ARS')}`}</Text>
      <Text
        style={styles.detail}
      >{`${t('properties.fields.salePrice')}: ${formatMoney(property.salePrice, property.saleCurrency ?? 'ARS')}`}</Text>
    </View>
  );
}

type PropertyVisitsCardProps = Readonly<{
  t: (key: string, options?: Record<string, unknown>) => string;
  visits?: PropertyVisit[];
  isLoading: boolean;
  hasError: boolean;
}>;

function PropertyVisitsCard({
  t,
  visits = [],
  isLoading,
  hasError,
}: PropertyVisitsCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>
        {t('properties.registerVisit', {
          defaultValue: 'Visitas comerciales',
        })}
      </Text>
      <Text style={styles.sectionSubtitle}>
        Al registrar la visita queda lista la notificacion al propietario.
      </Text>
      {isLoading ? (
        <Text style={styles.detail}>{t('common.loading')}</Text>
      ) : null}
      {hasError ? (
        <Text style={styles.error}>{t('messages.loadError')}</Text>
      ) : null}
      {!isLoading && !hasError && visits.length === 0 ? (
        <Text style={styles.detail}>Todavia no hay visitas registradas.</Text>
      ) : null}
      {visits.map((visit) => (
        <View key={visit.id} style={styles.entryCard}>
          <Text style={styles.entryTitle}>
            {visit.interestedName ?? 'Interesado sin nombre'}
          </Text>
          <Text style={styles.detail}>{formatDateTime(visit.visitedAt)}</Text>
          {visit.comments ? (
            <Text style={styles.detail}>{visit.comments}</Text>
          ) : null}
          {visit.hasOffer ? (
            <Text
              style={styles.detail}
            >{`Oferta: ${formatMoney(visit.offerAmount, visit.offerCurrency ?? 'ARS')}`}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

type PropertyMaintenanceCardProps = Readonly<{
  t: (key: string) => string;
  tasks?: PropertyMaintenanceTask[];
  isLoading: boolean;
  hasError: boolean;
}>;

function PropertyMaintenanceCard({
  t,
  tasks = [],
  isLoading,
  hasError,
}: PropertyMaintenanceCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>
        {t('properties.recentMaintenanceTasks')}
      </Text>
      {isLoading ? (
        <Text style={styles.detail}>{t('common.loading')}</Text>
      ) : null}
      {hasError ? (
        <Text style={styles.error}>{t('messages.loadError')}</Text>
      ) : null}
      {!isLoading && !hasError && tasks.length === 0 ? (
        <Text style={styles.detail}>{t('properties.noMaintenanceTasks')}</Text>
      ) : null}
      {tasks.map((task) => (
        <View key={task.id} style={styles.entryCard}>
          <Text style={styles.entryTitle}>{task.title}</Text>
          <Text style={styles.detail}>{formatDateTime(task.scheduledAt)}</Text>
          {task.notes ? <Text style={styles.detail}>{task.notes}</Text> : null}
        </View>
      ))}
    </View>
  );
}

type PropertyActionsProps = Readonly<{
  propertyId: string;
  onEdit: () => void;
  onNewMaintenance: () => void;
  onNewVisit: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}>;

function PropertyActions({
  propertyId,
  onEdit,
  onNewMaintenance,
  onNewVisit,
  t,
}: PropertyActionsProps) {
  return (
    <View style={styles.actions}>
      <AppButton
        title={t('properties.registerVisit', {
          defaultValue: 'Registrar visita',
        })}
        variant="secondary"
        onPress={onNewVisit}
        testID="propertyDetail.visit"
      />
      <AppButton
        title={t('properties.saveMaintenanceTask')}
        variant="secondary"
        onPress={onNewMaintenance}
        testID="propertyDetail.maintenance"
      />
      <AppButton
        title={t('common.edit')}
        onPress={onEdit}
        testID={`propertyDetail.edit.${propertyId}`}
      />
    </View>
  );
}

export default function PropertyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();

  const propertyQuery = useQuery({
    queryKey: ['properties', id],
    queryFn: () => propertiesApi.getById(id),
    enabled: Boolean(id),
  });

  const visitsQuery = useQuery({
    queryKey: ['properties', id, 'visits'],
    queryFn: () => propertiesApi.getVisits(id, 5),
    enabled: Boolean(id),
  });

  const maintenanceQuery = useQuery({
    queryKey: ['properties', id, 'maintenance'],
    queryFn: () => propertiesApi.getMaintenanceTasks(id, 5),
    enabled: Boolean(id),
  });

  const ownerQuery = useQuery({
    queryKey: ['owners', 'by-id', propertyQuery.data?.ownerId],
    queryFn: () => ownersApi.getById(propertyQuery.data?.ownerId ?? ''),
    enabled: Boolean(propertyQuery.data?.ownerId),
  });

  const property = propertyQuery.data;
  const ownerName = getOwnerDisplayName(
    ownerQuery.data?.firstName,
    ownerQuery.data?.lastName,
    ownerQuery.data?.email,
  );

  const openNewVisit = () =>
    router.push(`/(app)/properties/${id}/visits/new` as never);
  const openNewMaintenance = () =>
    router.push(`/(app)/properties/${id}/maintenance/new` as never);
  const openEditProperty = () =>
    router.push(`/(app)/properties/${id}/edit` as never);

  return (
    <Screen>
      {propertyQuery.isLoading ? <Text>{t('common.loading')}</Text> : null}
      {propertyQuery.error ? (
        <Text style={styles.error}>
          {getQueryErrorMessage(propertyQuery.error)}
        </Text>
      ) : null}
      {!propertyQuery.isLoading && !property ? (
        <Text>{t('properties.notFound')}</Text>
      ) : null}

      {property ? (
        <PropertySummaryCard ownerName={ownerName} property={property} t={t} />
      ) : null}

      {property ? (
        <PropertyVisitsCard
          hasError={Boolean(visitsQuery.error)}
          isLoading={visitsQuery.isLoading}
          t={t}
          visits={visitsQuery.data}
        />
      ) : null}

      {property ? (
        <PropertyMaintenanceCard
          hasError={Boolean(maintenanceQuery.error)}
          isLoading={maintenanceQuery.isLoading}
          tasks={maintenanceQuery.data}
          t={t}
        />
      ) : null}

      {property ? (
        <PropertyActions
          onEdit={openEditProperty}
          onNewMaintenance={openNewMaintenance}
          onNewVisit={openNewVisit}
          propertyId={property.id}
          t={t}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    backgroundColor: '#fff',
    padding: 14,
    gap: 6,
  },
  title: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 20,
  },
  detail: {
    color: '#334155',
  },
  sectionTitle: {
    color: '#0f172a',
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 4,
  },
  entryCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    padding: 10,
    gap: 2,
  },
  entryTitle: {
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

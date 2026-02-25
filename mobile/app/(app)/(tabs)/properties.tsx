import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { leasesApi } from '@/api/leases';
import { ownersApi } from '@/api/owners';
import { propertiesApi } from '@/api/properties';
import { Screen } from '@/components/screen';
import { i18n } from '@/i18n';
import type { Lease } from '@/types/lease';
import type { Owner, OwnerSettlementSummary } from '@/types/owner';
import type { Property } from '@/types/property';

type LeaseAction =
  | { type: 'view'; leaseId: string }
  | { type: 'renew'; leaseId: string; contractType: Lease['contractType'] }
  | { type: 'create' }
  | { type: 'none' };

const formatAmount = (amount: number, currencyCode = 'ARS') => {
  return new Intl.NumberFormat(i18n.language || 'es', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(amount);
};

const byNewest = <T extends { updatedAt: string; createdAt: string }>(items: T[]): T[] =>
  [...items].sort(
    (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime(),
  );

const toDateAtStartOfDay = (value: string): Date => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const isRentalLeaseExpired = (lease: Lease): boolean => {
  if (lease.contractType !== 'rental' || !lease.endDate) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return toDateAtStartOfDay(lease.endDate) < today;
};

const resolveLeaseAction = (leases: Lease[], operations: Property['operations']): LeaseAction => {
  const ordered = byNewest(leases);

  const draft = ordered.find((lease) => lease.status === 'DRAFT');
  if (draft) {
    return { type: 'view', leaseId: draft.id };
  }

  const activeNonExpired = ordered.find((lease) => lease.status === 'ACTIVE' && !isRentalLeaseExpired(lease));
  if (activeNonExpired) {
    return { type: 'view', leaseId: activeNonExpired.id };
  }

  const expiredRental = ordered.find((lease) => isRentalLeaseExpired(lease));
  if (expiredRental) {
    return { type: 'renew', leaseId: expiredRental.id, contractType: expiredRental.contractType };
  }

  if (ordered[0]) {
    return { type: 'view', leaseId: ordered[0].id };
  }

  const canCreate = (operations ?? []).includes('rent') || (operations ?? []).includes('sale');
  if (canCreate) {
    return { type: 'create' };
  }

  return { type: 'none' };
};

const ownerSearchHaystack = (owner: Owner): string =>
  `${owner.firstName} ${owner.lastName} ${owner.email ?? ''} ${owner.phone ?? ''}`.toLowerCase();

function ActionChip({ title, onPress, testID }: { title: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable style={styles.actionChip} onPress={onPress} testID={testID}>
      <Text style={styles.actionChipText}>{title}</Text>
    </Pressable>
  );
}

export default function PropertiesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [expandedOwnerId, setExpandedOwnerId] = useState<string | null>(null);

  const ownersQuery = useQuery({
    queryKey: ['owners'],
    queryFn: ownersApi.getAll,
  });

  const propertiesQuery = useQuery({
    queryKey: ['properties'],
    queryFn: propertiesApi.getAll,
  });

  const leasesQuery = useQuery({
    queryKey: ['leases'],
    queryFn: leasesApi.getAll,
  });

  const ownerIdsKey = useMemo(() => (ownersQuery.data ?? []).map((owner) => owner.id).sort().join(','), [ownersQuery.data]);

  const settlementsQuery = useQuery({
    queryKey: ['owners', 'settlements', ownerIdsKey],
    enabled: ownerIdsKey.length > 0,
    queryFn: async () => {
      const owners = ownersQuery.data ?? [];
      const result = await Promise.all(
        owners.map(async (owner) => {
          const settlements = await ownersApi.getSettlements(owner.id, 'all', 3);
          return [owner.id, settlements] as const;
        }),
      );

      return Object.fromEntries(result) as Record<string, OwnerSettlementSummary[]>;
    },
  });

  const ownersBySearch = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const owners = ownersQuery.data ?? [];
    if (!needle) {
      return owners;
    }
    return owners.filter((owner) => ownerSearchHaystack(owner).includes(needle));
  }, [ownersQuery.data, query]);

  const propertiesByOwner = useMemo(() => {
    const grouped: Record<string, Property[]> = {};
    for (const owner of ownersQuery.data ?? []) {
      grouped[owner.id] = [];
    }

    for (const property of propertiesQuery.data ?? []) {
      if (!property.ownerId) {
        continue;
      }
      const current = grouped[property.ownerId] ?? [];
      grouped[property.ownerId] = [...current, property];
    }

    for (const ownerId of Object.keys(grouped)) {
      grouped[ownerId] = [...grouped[ownerId]].sort((a, b) => a.name.localeCompare(b.name));
    }

    return grouped;
  }, [ownersQuery.data, propertiesQuery.data]);

  const leasesByProperty = useMemo(() => {
    const grouped: Record<string, Lease[]> = {};
    for (const lease of leasesQuery.data ?? []) {
      if (!lease.propertyId) {
        continue;
      }
      const current = grouped[lease.propertyId] ?? [];
      grouped[lease.propertyId] = [...current, lease];
    }

    for (const propertyId of Object.keys(grouped)) {
      grouped[propertyId] = byNewest(grouped[propertyId]);
    }

    return grouped;
  }, [leasesQuery.data]);

  const isLoading = ownersQuery.isLoading || propertiesQuery.isLoading || leasesQuery.isLoading;
  const hasError = ownersQuery.error || propertiesQuery.error || leasesQuery.error;

  return (
    <Screen>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('properties.ownerSearchPlaceholder')}
        style={styles.searchInput}
        testID="properties.owners.search"
      />

      {isLoading ? <ActivityIndicator /> : null}
      {hasError ? <Text style={styles.error}>{t('messages.loadError')}</Text> : null}

      <View style={styles.ownersList}>
        {ownersBySearch.map((owner) => {
          const ownerDisplayName = `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim() || owner.email || t('common.noDataAvailable');
          const ownerProperties = propertiesByOwner[owner.id] ?? [];
          const ownerSettlements = settlementsQuery.data?.[owner.id] ?? [];
          const isExpanded = expandedOwnerId === owner.id;

          return (
            <View key={owner.id} style={styles.ownerCard} testID={`owner.card.${owner.id}`}>
              <Pressable
                onPress={() => setExpandedOwnerId((current) => (current === owner.id ? null : owner.id))}
                style={styles.ownerHeaderPressable}
                testID={`owner.header.${owner.id}`}
              >
                <View style={styles.ownerHeaderText}>
                  <Text style={styles.ownerName}>{ownerDisplayName}</Text>
                  <Text style={styles.ownerDetail}>{owner.email || '-'}</Text>
                  {owner.phone ? <Text style={styles.ownerDetail}>{owner.phone}</Text> : null}
                </View>
                <Text style={styles.expandIndicator}>{isExpanded ? '▴' : '▾'}</Text>
              </Pressable>

              <View style={styles.ownerActionsRow}>
                <ActionChip
                  title={t('properties.addPropertyForOwner')}
                  onPress={() => router.push(`/(app)/properties/new?ownerId=${encodeURIComponent(owner.id)}` as never)}
                  testID={`owner.addProperty.${owner.id}`}
                />
                <ActionChip
                  title={t('common.edit')}
                  onPress={() => router.push(`/(app)/owners/${owner.id}/edit` as never)}
                  testID={`owner.edit.${owner.id}`}
                />
                <ActionChip
                  title={t('properties.ownerPay')}
                  onPress={() => router.push(`/(app)/owners/${owner.id}/pay` as never)}
                  testID={`owner.pay.${owner.id}`}
                />
              </View>

              {isExpanded ? (
                <View style={styles.ownerDetailBlock}>
                  <Text style={styles.sectionTitle}>{`${t('properties.ownerAssignedProperties')} (${ownerProperties.length})`}</Text>
                  {ownerProperties.length === 0 ? (
                    <Text style={styles.mutedText}>{t('properties.ownerNoProperties')}</Text>
                  ) : (
                    ownerProperties.map((property) => {
                      const settlementsText = ownerSettlements
                        .slice(0, 2)
                        .map((settlement) => `${settlement.period}: ${formatAmount(settlement.netAmount, settlement.currencyCode)}`)
                        .join(' · ');
                      const leaseAction = resolveLeaseAction(leasesByProperty[property.id] ?? [], property.operations);

                      return (
                        <View key={property.id} style={styles.propertyCard} testID={`property.card.${property.id}`}>
                          <Text style={styles.propertyTitle}>{property.name}</Text>
                          <Text style={styles.ownerDetail}>{`${property.address.street} ${property.address.number}, ${property.address.city}`}</Text>
                          {settlementsText ? (
                            <Text style={styles.paymentPreview}>{`${t('properties.ownerRecentPayments')}: ${settlementsText}`}</Text>
                          ) : (
                            <Text style={styles.paymentPreview}>{`${t('properties.ownerRecentPayments')}: -`}</Text>
                          )}

                          <View style={styles.propertyActionsRow}>
                            <ActionChip
                              title={t('common.view')}
                              onPress={() => router.push(`/(app)/properties/${property.id}` as never)}
                              testID={`property.view.${property.id}`}
                            />
                            <ActionChip
                              title={t('common.edit')}
                              onPress={() => router.push(`/(app)/properties/${property.id}/edit` as never)}
                              testID={`property.edit.${property.id}`}
                            />
                            <ActionChip
                              title={t('properties.saveMaintenanceTask')}
                              onPress={() =>
                                router.push(`/(app)/properties/${property.id}/maintenance/new` as never)
                              }
                              testID={`property.maintenance.new.${property.id}`}
                            />
                            {leaseAction.type === 'view' ? (
                              <ActionChip
                                title={t('properties.viewLease')}
                                onPress={() => router.push(`/(app)/leases/${leaseAction.leaseId}` as never)}
                                testID={`property.lease.view.${property.id}`}
                              />
                            ) : null}
                            {leaseAction.type === 'create' ? (
                              <ActionChip
                                title={t('properties.createLease')}
                                onPress={() => {
                                  const query = new URLSearchParams({
                                    propertyId: property.id,
                                    propertyName: property.name,
                                    ownerId: owner.id,
                                  });
                                  if (property.operations && property.operations.length > 0) {
                                    query.set('propertyOperations', property.operations.join(','));
                                  }
                                  const ownerName = `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim() || owner.email;
                                  if (ownerName) {
                                    query.set('ownerName', ownerName);
                                  }

                                  router.push(`/(app)/leases/new?${query.toString()}` as never);
                                }}
                                testID={`property.lease.create.${property.id}`}
                              />
                            ) : null}
                            {leaseAction.type === 'renew' ? (
                              <ActionChip
                                title={t('properties.renewLease')}
                                onPress={() => {
                                  const query = new URLSearchParams({
                                    propertyId: property.id,
                                    propertyName: property.name,
                                    ownerId: owner.id,
                                    previousLeaseId: leaseAction.leaseId,
                                    contractType: leaseAction.contractType,
                                  });
                                  if (property.operations && property.operations.length > 0) {
                                    query.set('propertyOperations', property.operations.join(','));
                                  }
                                  const ownerName = `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim() || owner.email;
                                  if (ownerName) {
                                    query.set('ownerName', ownerName);
                                  }

                                  router.push(`/(app)/leases/new?${query.toString()}` as never);
                                }}
                                testID={`property.lease.renew.${property.id}`}
                              />
                            ) : null}
                          </View>
                        </View>
                      );
                    })
                  )}

                  <Text style={styles.sectionTitle}>{t('properties.ownerRecentPayments')}</Text>
                  {ownerSettlements.length === 0 ? (
                    <Text style={styles.mutedText}>{t('properties.ownerNoRecentPayments')}</Text>
                  ) : (
                    ownerSettlements.map((settlement) => (
                      <View key={settlement.id} style={styles.paymentRow}>
                        <Text style={styles.paymentRowTitle}>{settlement.period}</Text>
                        <Text style={styles.paymentRowDetail}>{formatAmount(settlement.netAmount, settlement.currencyCode)}</Text>
                        <Text style={styles.paymentRowStatus}>{settlement.status}</Text>
                      </View>
                    ))
                  )}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    color: '#111827',
    marginBottom: 12,
  },
  ownersList: {
    gap: 12,
  },
  ownerCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  ownerName: {
    fontWeight: '700',
    color: '#0f172a',
    fontSize: 16,
  },
  ownerHeaderPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  ownerHeaderText: {
    flex: 1,
    gap: 2,
  },
  expandIndicator: {
    fontSize: 18,
    color: '#1d4ed8',
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  ownerDetail: {
    color: '#475569',
  },
  ownerActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  ownerDetailBlock: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
    gap: 8,
  },
  sectionTitle: {
    color: '#0f172a',
    fontWeight: '700',
  },
  mutedText: {
    color: '#64748b',
  },
  propertyCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#f8fafc',
    gap: 4,
  },
  propertyTitle: {
    color: '#0f172a',
    fontWeight: '700',
  },
  paymentPreview: {
    color: '#334155',
    fontSize: 12,
  },
  propertyActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  actionChip: {
    borderWidth: 1,
    borderColor: '#93c5fd',
    backgroundColor: '#eff6ff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionChipText: {
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: 12,
  },
  paymentRow: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 8,
    backgroundColor: '#fff',
    gap: 2,
  },
  paymentRowTitle: {
    color: '#0f172a',
    fontWeight: '700',
  },
  paymentRowDetail: {
    color: '#334155',
  },
  paymentRowStatus: {
    color: '#0369a1',
    textTransform: 'uppercase',
    fontSize: 11,
    fontWeight: '700',
  },
  error: {
    color: '#b91c1c',
    marginBottom: 8,
  },
});

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { interestedApi } from '@/api/interested';
import { Screen } from '@/components/screen';
import { ChoiceGroup } from '@/components/ui';
import { i18n } from '@/i18n';
import type { InterestedMatch, InterestedOperation, InterestedProfile, InterestedStatus, InterestedSummary } from '@/types/interested';

type OperationFilter = 'all' | InterestedOperation;
type StatusFilter = 'all' | InterestedStatus;

const getDisplayName = (profile: InterestedProfile) => {
  const fullName = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim();
  return fullName.length > 0 ? fullName : profile.phone;
};

const getOperations = (profile: InterestedProfile): InterestedOperation[] =>
  profile.operations ?? (profile.operation ? [profile.operation] : ['rent']);

const statusStyle = (status?: InterestedStatus) => {
  if (status === 'tenant') return styles.statusTenant;
  if (status === 'buyer') return styles.statusBuyer;
  return styles.statusInterested;
};

const formatMoney = (amount?: number) => {
  if (amount === undefined || amount === null) return '-';
  return new Intl.NumberFormat(i18n.language || 'es', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString(i18n.language || 'es');
};

function ActionChip({
  title,
  onPress,
  variant = 'primary',
  disabled,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      style={[
        styles.actionChip,
        variant === 'secondary' && styles.actionChipSecondary,
        disabled && styles.actionChipDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
    >
      <Text style={[styles.actionChipText, variant === 'secondary' && styles.actionChipTextSecondary]}>{title}</Text>
    </Pressable>
  );
}

export default function InterestedScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [operationFilter, setOperationFilter] = useState<OperationFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<InterestedSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const operationOptions: Array<{ label: string; value: OperationFilter }> = [
    { label: t('interested.filters.allOperations'), value: 'all' },
    { label: t('interested.operations.rent'), value: 'rent' },
    { label: t('interested.operations.sale'), value: 'sale' },
  ];

  const statusOptions: Array<{ label: string; value: StatusFilter }> = [
    { label: t('interested.filters.allStages'), value: 'all' },
    { label: t('interested.status.interested'), value: 'interested' },
    { label: t('interested.status.tenant'), value: 'tenant' },
    { label: t('interested.status.buyer'), value: 'buyer' },
  ];

  const statusLabel = (status?: InterestedStatus) => t(`interested.status.${status ?? 'interested'}`);
  const operationLabel = (operation: InterestedOperation) => t(`interested.operations.${operation}`);

  const interestedQuery = useQuery({
    queryKey: ['interested', 'list'],
    queryFn: () => interestedApi.getAllWithFilters({ limit: 100 }),
  });

  const confirmingRentMutation = useMutation({
    mutationFn: async ({ profile, match }: { profile: InterestedProfile; match: InterestedMatch }) => {
      if (!profile.convertedToTenantId) {
        await interestedApi.convertToTenant(profile.id, {});
      }
      if (match.status !== 'accepted') {
        await interestedApi.updateMatch(profile.id, match.id, 'accepted');
      }
      return interestedApi.getSummary(profile.id);
    },
    onSuccess: async (summary) => {
      setSelectedSummary(summary);
      await queryClient.invalidateQueries({ queryKey: ['interested'] });
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('interested.actions.confirmRent'));
    },
  });

  const selectedProfile = useMemo(() => {
    if (!selectedProfileId) return null;
    return (interestedQuery.data?.data ?? []).find((item) => item.id === selectedProfileId) ?? null;
  }, [interestedQuery.data?.data, selectedProfileId]);

  const filteredProfiles = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return [...(interestedQuery.data?.data ?? [])]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .filter((profile) => {
        const operations = getOperations(profile);
        if (operationFilter !== 'all' && !operations.includes(operationFilter)) {
          return false;
        }
        if (statusFilter !== 'all' && (profile.status ?? 'interested') !== statusFilter) {
          return false;
        }
        if (!term) return true;
        const fullName = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.toLowerCase();
        return (
          fullName.includes(term) ||
          (profile.phone ?? '').toLowerCase().includes(term) ||
          (profile.email ?? '').toLowerCase().includes(term)
        );
      });
  }, [interestedQuery.data?.data, operationFilter, statusFilter, searchTerm]);

  const sortedActivities = useMemo(() => {
    return [...(selectedSummary?.activities ?? [])].sort(
      (a, b) => new Date(b.dueAt ?? b.createdAt).getTime() - new Date(a.dueAt ?? a.createdAt).getTime(),
    );
  }, [selectedSummary?.activities]);

  const selectProfile = async (profile: InterestedProfile) => {
    if (selectedProfileId === profile.id) {
      setSelectedProfileId(null);
      setSelectedSummary(null);
      return;
    }

    setSelectedProfileId(profile.id);
    setLoadingSummary(true);
    try {
      const summary = await interestedApi.getSummary(profile.id);
      setSelectedSummary(summary);
    } catch (error) {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.loadError'));
      setSelectedSummary(null);
    } finally {
      setLoadingSummary(false);
    }
  };

  const canConfirmRent = (profile: InterestedProfile, match: InterestedMatch) => {
    const profileOperations = getOperations(profile);
    const propertyOperations = match.property?.operations ?? [];
    if (!profileOperations.includes('rent')) return false;
    if (propertyOperations.length === 0) return true;
    return propertyOperations.includes('rent');
  };

  return (
    <Screen>
      <TextInput
        value={searchTerm}
        onChangeText={setSearchTerm}
        placeholder={t('interested.listSearchPlaceholder')}
        style={styles.searchInput}
        autoCapitalize="none"
        testID="interested.search"
      />

      <ChoiceGroup
        label={t('common.filter')}
        value={operationFilter}
        onChange={setOperationFilter}
        options={operationOptions}
        testID="interested.filter.operation"
      />

      <ChoiceGroup
        label={t('interested.filters.allStages')}
        value={statusFilter}
        onChange={setStatusFilter}
        options={statusOptions}
        testID="interested.filter.status"
      />

      {interestedQuery.isLoading ? <ActivityIndicator /> : null}
      {interestedQuery.error ? <Text style={styles.error}>{(interestedQuery.error as Error).message}</Text> : null}

      <View style={styles.list}>
        {filteredProfiles.map((profile) => {
          const operations = getOperations(profile);
          const isSelected = selectedProfileId === profile.id;
          const hasLoadedSummary = isSelected && selectedSummary?.profile.id === profile.id;

          return (
            <View key={profile.id} style={[styles.card, isSelected && styles.cardSelected]} testID={`interested.item.${profile.id}`}>
              <Pressable onPress={() => void selectProfile(profile)} style={styles.cardHeaderPressable}>
                <View style={styles.cardHeaderLine}>
                  <Text style={styles.title}>{getDisplayName(profile)}</Text>
                  <Text style={[styles.statusBadge, statusStyle(profile.status)]}>{statusLabel(profile.status)}</Text>
                </View>
                <Text style={styles.detail}>{profile.phone}</Text>
                {profile.email ? <Text style={styles.detail}>{profile.email}</Text> : null}
                <Text style={styles.detail}>{t('interested.operationsLabel', { op: operations.map(operationLabel).join(', ') })}</Text>
              </Pressable>

              <View style={styles.actionsRow}>
                <ActionChip
                  title={t('interested.actions.edit')}
                  onPress={() => router.push(`/(app)/interested/${profile.id}/edit` as never)}
                  testID={`interested.edit.${profile.id}`}
                />
                <ActionChip
                  title={t('interested.activities.add')}
                  variant="secondary"
                  onPress={() => router.push(`/(app)/interested/${profile.id}/activities/new` as never)}
                  testID={`interested.activity.new.${profile.id}`}
                />
              </View>

              {isSelected ? (
                <View style={styles.expandedSection}>
                  {loadingSummary && !hasLoadedSummary ? (
                    <ActivityIndicator />
                  ) : (
                    <>
                      <Text style={styles.sectionTitle}>{t('interested.matchesTitle')}</Text>
                      {(selectedSummary?.matches ?? []).length === 0 ? (
                        <Text style={styles.empty}>{t('interested.noMatches')}</Text>
                      ) : (
                        <View style={styles.subList}>
                          {(selectedSummary?.matches ?? []).map((match) => {
                            const canConfirm = canConfirmRent(profile, match);
                            const confirmingCurrent =
                              confirmingRentMutation.isPending &&
                              confirmingRentMutation.variables?.match.id === match.id;
                            return (
                              <View key={match.id} style={styles.subCard} testID={`interested.match.${match.id}`}>
                                <Text style={styles.subTitle}>{match.property?.name ?? t('interested.matchesTitle')}</Text>
                                <Text style={styles.detail}>{`${t('interested.labels.score')}: ${(match.score ?? 0).toFixed(2)}%`}</Text>
                                {match.property?.address?.city ? (
                                  <Text style={styles.detail}>{match.property.address.city}</Text>
                                ) : null}
                                <Text style={styles.detail}>
                                  {`${t('interested.operations.rent')}: ${formatMoney(match.property?.rentPrice)} · ${t('interested.operations.sale')}: ${formatMoney(match.property?.salePrice)}`}
                                </Text>
                                <Text style={styles.detail}>{`${t('dashboard.activity.columns.status')}: ${t(`interested.matchStatus.${match.status}`)}`}</Text>
                                <View style={styles.actionsRow}>
                                  <ActionChip
                                    title={confirmingCurrent ? t('interested.actions.confirming') : t('interested.actions.confirmRent')}
                                    onPress={() => {
                                      confirmingRentMutation.mutate({ profile, match });
                                    }}
                                    disabled={!canConfirm || confirmingCurrent}
                                    testID={`interested.confirm.rent.${match.id}`}
                                  />
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}

                      <Text style={styles.sectionTitle}>{t('interested.activities.title')}</Text>
                      {sortedActivities.length === 0 ? (
                        <Text style={styles.empty}>{t('interested.activities.empty')}</Text>
                      ) : (
                        <View style={styles.subList}>
                          {sortedActivities.map((activity) => (
                            <View key={activity.id} style={styles.subCard} testID={`interested.activity.${activity.id}`}>
                              <View style={styles.cardHeaderLine}>
                                <Text style={styles.subTitle}>{activity.subject}</Text>
                                <Text style={styles.activityStatus}>{t(`interested.activityStatus.${activity.status}`)}</Text>
                              </View>
                              <Text style={styles.detail}>{`${t(`interested.activityTypes.${activity.type}`)} · ${formatDate(activity.createdAt)}`}</Text>
                              {activity.body ? <Text style={styles.detail}>{activity.body}</Text> : null}
                            </View>
                          ))}
                        </View>
                      )}
                    </>
                  )}
                </View>
              ) : null}
            </View>
          );
        })}

        {!interestedQuery.isLoading && filteredProfiles.length === 0 ? (
          <Text style={styles.empty}>{t('interested.noResults')}</Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    color: '#111827',
    marginBottom: 8,
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
    gap: 8,
  },
  cardSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  cardHeaderPressable: {
    gap: 2,
  },
  cardHeaderLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: {
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
  },
  detail: {
    color: '#475569',
    fontSize: 13,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    overflow: 'hidden',
  },
  statusInterested: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
  },
  statusTenant: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  statusBuyer: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionChip: {
    borderWidth: 1,
    borderColor: '#1d4ed8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#dbeafe',
  },
  actionChipSecondary: {
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  actionChipDisabled: {
    opacity: 0.5,
  },
  actionChipText: {
    color: '#1e3a8a',
    fontWeight: '700',
    fontSize: 12,
  },
  actionChipTextSecondary: {
    color: '#334155',
  },
  expandedSection: {
    borderTopWidth: 1,
    borderTopColor: '#bfdbfe',
    paddingTop: 10,
    gap: 8,
  },
  sectionTitle: {
    color: '#0f172a',
    fontWeight: '700',
  },
  subList: {
    gap: 8,
  },
  subCard: {
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    padding: 10,
    gap: 4,
  },
  subTitle: {
    color: '#0f172a',
    fontWeight: '700',
  },
  activityStatus: {
    color: '#334155',
    textTransform: 'uppercase',
    fontWeight: '700',
    fontSize: 11,
  },
  empty: {
    color: '#64748b',
  },
  error: {
    color: '#b91c1c',
  },
});

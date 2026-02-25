import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { tenantsApi } from '@/api/tenants';
import { Screen } from '@/components/screen';
import { H1 } from '@/components/ui';

function ActionChip({ title, onPress, testID }: { title: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable style={styles.actionChip} onPress={onPress} testID={testID}>
      <Text style={styles.actionChipText}>{title}</Text>
    </Pressable>
  );
}

export default function TenantsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  const tenantsQuery = useQuery({
    queryKey: ['tenants', debouncedSearch],
    queryFn: () => tenantsApi.getAll(debouncedSearch ? { name: debouncedSearch } : undefined),
  });

  const tenants = useMemo(() => tenantsQuery.data ?? [], [tenantsQuery.data]);

  const toDisplayName = (firstName?: string, lastName?: string, email?: string) => {
    const fullName = `${firstName ?? ''} ${lastName ?? ''}`.trim();
    if (fullName.length > 0) return fullName;
    if (email && email.trim().length > 0) return email;
    return t('common.noDataAvailable');
  };

  const statusLabel = (status: string) => {
    if (status === 'ACTIVE') return t('tenants.status.ACTIVE');
    if (status === 'INACTIVE') return t('tenants.status.INACTIVE');
    return t('tenants.status.PROSPECT');
  };

  const statusStyle = (status: string) => {
    if (status === 'ACTIVE') return styles.statusActive;
    if (status === 'INACTIVE') return styles.statusInactive;
    return styles.statusProspect;
  };

  return (
    <Screen>
      <H1>{t('tenants.title')}</H1>

      <TextInput
        value={searchTerm}
        onChangeText={setSearchTerm}
        placeholder={t('tenants.searchPlaceholder')}
        style={styles.searchInput}
        autoCapitalize="none"
        testID="tenants.search"
      />

      {tenantsQuery.isLoading ? <ActivityIndicator /> : null}
      {tenantsQuery.error ? <Text style={styles.error}>{(tenantsQuery.error as Error).message}</Text> : null}

      <View style={styles.list}>
        {tenants.map((tenant) => (
          <View key={tenant.id} testID={`tenants.item.${tenant.id}`} style={styles.card}>
            <View style={styles.headerLine}>
              <Pressable onPress={() => router.push(`/(app)/tenants/${tenant.id}` as never)} testID={`tenants.open.${tenant.id}`}>
                <Text style={styles.title}>{toDisplayName(tenant.firstName, tenant.lastName, tenant.email)}</Text>
              </Pressable>
              <Text style={[styles.statusBadge, statusStyle(tenant.status)]}>{statusLabel(tenant.status)}</Text>
            </View>
            <Text style={styles.detail}>{tenant.email || '-'}</Text>
            <Text style={styles.detail}>{tenant.phone || '-'}</Text>

            <View style={styles.actionsRow}>
              <ActionChip
                title={t('common.edit')}
                onPress={() => router.push(`/(app)/tenants/${tenant.id}/edit` as never)}
                testID={`tenant.edit.${tenant.id}`}
              />
              <ActionChip
                title={t('tenants.paymentRegistration.title')}
                onPress={() => router.push(`/(app)/tenants/${tenant.id}/payments/new` as never)}
                testID={`tenant.payment.new.${tenant.id}`}
              />
              <ActionChip
                title={t('tenants.activities.add')}
                onPress={() => router.push(`/(app)/tenants/${tenant.id}/activities/new` as never)}
                testID={`tenant.activity.new.${tenant.id}`}
              />
            </View>
          </View>
        ))}
        {!tenantsQuery.isLoading && tenants.length === 0 ? (
          <Text style={styles.empty}>{t('tenants.noTenantsDescription')}</Text>
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
    marginBottom: 12,
  },
  list: {
    gap: 12,
    paddingBottom: 20,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  headerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  detail: {
    color: '#475569',
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
  statusInactive: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  statusProspect: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  actionsRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionChip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  actionChipText: {
    color: '#1e3a8a',
    fontWeight: '700',
    fontSize: 12,
  },
  empty: {
    color: '#475569',
  },
  error: {
    color: '#b91c1c',
    marginBottom: 8,
  },
});

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { tenantsApi } from '@/api/tenants';
import { Screen } from '@/components/screen';
import { AppButton, H1 } from '@/components/ui';

export default function TenantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const query = useQuery({
    queryKey: ['tenants', id],
    queryFn: () => tenantsApi.getById(id),
    enabled: Boolean(id),
  });

  const deleteMutation = useMutation({
    mutationFn: () => tenantsApi.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
      router.replace('/(app)/(tabs)/tenants');
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('tenants.deleteError'));
    },
  });

  const tenant = query.data;

  return (
    <Screen>
      <H1>{t('tenants.tenantDetails')}</H1>
      {query.isLoading ? <Text>{t('common.loading')}</Text> : null}
      {query.error ? <Text style={styles.error}>{(query.error as Error).message}</Text> : null}
      {!query.isLoading && !tenant ? <Text>{t('tenants.notFound')}</Text> : null}

      {tenant ? (
        <View style={styles.card}>
          <Text style={styles.title}>{`${tenant.firstName} ${tenant.lastName}`}</Text>
          <Text style={styles.detail}>{tenant.email}</Text>
          <Text style={styles.detail}>{tenant.phone}</Text>
          <Text style={styles.detail}>{`${t('tenants.fields.dni')}: ${tenant.dni}`}</Text>
          <Text style={styles.detail}>{t(`tenants.status.${tenant.status}`)}</Text>
        </View>
      ) : null}

      {tenant ? (
        <View style={styles.actions}>
          <AppButton
            title={t('common.edit')}
            onPress={() => router.push(`/(app)/tenants/${tenant.id}/edit`)}
            testID="tenantDetail.edit"
          />
          <AppButton
            title={t('common.delete')}
            variant="secondary"
            loading={deleteMutation.isPending}
            testID="tenantDetail.delete"
            onPress={() => {
              Alert.alert(t('tenants.deleteTenant'), t('tenants.confirmDelete'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('common.delete'), style: 'destructive', onPress: () => deleteMutation.mutate() },
              ]);
            }}
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
  actions: {
    marginTop: 16,
    gap: 10,
  },
  error: {
    color: '#b91c1c',
  },
});

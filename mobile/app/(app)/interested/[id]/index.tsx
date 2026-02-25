import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { interestedApi } from '@/api/interested';
import { Screen } from '@/components/screen';
import { AppButton, H1 } from '@/components/ui';

export default function InterestedDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const query = useQuery({
    queryKey: ['interested', id],
    queryFn: () => interestedApi.getById(id),
    enabled: Boolean(id),
  });

  const deleteMutation = useMutation({
    mutationFn: () => interestedApi.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['interested'] });
      router.replace('/(app)/(tabs)/interested');
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.deleteError'));
    },
  });

  const profile = query.data;

  return (
    <Screen>
      <H1>{t('interested.title')}</H1>
      {query.isLoading ? <Text>{t('common.loading')}</Text> : null}
      {query.error ? <Text style={styles.error}>{(query.error as Error).message}</Text> : null}
      {!query.isLoading && !profile ? <Text>{t('interested.noResults')}</Text> : null}

      {profile ? (
        <View style={styles.card}>
          <Text style={styles.title}>{`${profile.firstName ?? ''} ${profile.lastName ?? ''}`}</Text>
          <Text style={styles.detail}>{profile.phone}</Text>
          <Text style={styles.detail}>{profile.email ?? '-'}</Text>
          <Text style={styles.detail}>{`${t('interested.fields.operations')}: ${profile.operation ?? profile.operations?.[0] ?? '-'}`}</Text>
          <Text style={styles.detail}>{`${t('tenants.leaseStatus')}: ${profile.status ?? '-'}`}</Text>
          <Text style={styles.detail}>{`${t('interested.labels.score')}: ${profile.qualificationLevel ?? '-'}`}</Text>
          <Text style={styles.detail}>{`${t('payments.amount')}: ${profile.minAmount ?? '-'} a ${profile.maxAmount ?? '-'}`}</Text>
          <Text style={styles.detail}>{profile.notes ?? '-'}</Text>
        </View>
      ) : null}

      {profile ? (
        <View style={styles.actions}>
          <AppButton
            title={t('interested.activities.add')}
            variant="secondary"
            onPress={() => router.push(`/(app)/interested/${profile.id}/activities/new` as never)}
            testID="interestedDetail.activity.new"
          />
          <AppButton
            title={t('common.edit')}
            onPress={() => router.push(`/(app)/interested/${profile.id}/edit` as never)}
            testID="interestedDetail.edit"
          />
          <AppButton
            title={t('common.delete')}
            variant="secondary"
            loading={deleteMutation.isPending}
            testID="interestedDetail.delete"
            onPress={() => {
              Alert.alert(t('common.delete'), t('messages.deleteConfirm'), [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.delete'),
                  style: 'destructive',
                  onPress: () => deleteMutation.mutate(),
                },
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

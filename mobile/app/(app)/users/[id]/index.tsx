import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { usersApi } from '@/api/users';
import { Screen } from '@/components/screen';
import { AppButton, H1 } from '@/components/ui';

export default function UserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const query = useQuery({
    queryKey: ['users', id],
    queryFn: () => usersApi.getById(id),
    enabled: Boolean(id),
  });

  const toggleMutation = useMutation({
    mutationFn: (isActive: boolean) => usersApi.setActivation(id, isActive),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['users', id] });
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('users.errors.activation'));
    },
  });

  const user = query.data;

  return (
    <Screen>
      <H1>{t('users.userDetails')}</H1>
      {query.isLoading ? <Text>{t('common.loading')}</Text> : null}
      {query.error ? <Text style={styles.error}>{(query.error as Error).message}</Text> : null}
      {!query.isLoading && !user ? <Text>{t('users.noUsers')}</Text> : null}

      {user ? (
        <View style={styles.card}>
          <Text style={styles.title}>{`${user.firstName} ${user.lastName}`}</Text>
          <Text style={styles.detail}>{user.email}</Text>
          <Text style={styles.detail}>{user.phone ?? '-'}</Text>
          <Text style={styles.detail}>{`${t('auth.role')}: ${user.role}`}</Text>
          <Text style={styles.detail}>{`${t('users.status')}: ${user.isActive ? t('users.active') : t('users.inactive')}`}</Text>
        </View>
      ) : null}

      {user ? (
        <View style={styles.actions}>
          <AppButton
            title={t('common.edit')}
            onPress={() => router.push(`/(app)/users/${user.id}/edit` as never)}
            testID="userDetail.edit"
          />
          <AppButton
            title={user.isActive ? t('users.deactivate') : t('users.activate')}
            variant="secondary"
            loading={toggleMutation.isPending}
            testID="userDetail.toggleActivation"
            onPress={() => toggleMutation.mutate(!user.isActive)}
          />
          <AppButton
            title={t('users.resetPassword')}
            variant="secondary"
            testID="userDetail.resetPassword"
            onPress={() => router.push(`/(app)/users/${user.id}/reset-password` as never)}
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

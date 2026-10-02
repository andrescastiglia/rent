import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from '@/components/themed-native';
import { Pagination } from '@/components/pagination';
import { Field } from '@/components/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Alert, StyleSheet } from 'react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usersApi } from '@/api/users';
import { Screen } from '@/components/screen';

const getToggleButtonLabel = (
  isSaving: boolean,
  isActive: boolean | undefined,
  t: (key: string) => string,
) => {
  if (isSaving) {
    return t('common.saving');
  }
  return isActive ? t('users.deactivate') : t('users.activate');
};

export default function UsersScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['users', page, search],
    queryFn: () => usersApi.list(page, 20, search),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      usersApi.setActivation(id, isActive),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => {
      Alert.alert(
        t('common.error'),
        error instanceof Error ? error.message : t('users.errors.activation'),
      );
    },
  });

  return (
    <Screen guidanceReady={!isFetching} guidanceBlocked={Boolean(error)}>
      <Field
        label={t('common.search')}
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />
      {isLoading ? <ActivityIndicator /> : null}
      {error ? <Text style={styles.error}>{error.message}</Text> : null}

      <View style={styles.list}>
        {(data?.data ?? []).map((user) => (
          <View
            key={user.id}
            testID={`users.item.${user.id}`}
            style={styles.card}
          >
            <View style={styles.titleRow}>
              <Text
                style={styles.title}
                numberOfLines={1}
                ellipsizeMode="tail"
              >{`${user.firstName} ${user.lastName}`}</Text>
              <ScrollView
                horizontal
                style={styles.actionsScroller}
                contentContainerStyle={styles.inlineActions}
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Pressable
                  testID={`users.edit.${user.id}`}
                  style={styles.actionChip}
                  onPress={() =>
                    router.push(`/(app)/users/${user.id}/edit` as never)
                  }
                >
                  <Text style={styles.actionChipText}>{t('common.edit')}</Text>
                </Pressable>
                <Pressable
                  testID={`users.resetPassword.${user.id}`}
                  style={styles.actionChip}
                  disabled={Boolean(togglingUserId)}
                  onPress={() =>
                    router.push(
                      `/(app)/users/${user.id}/reset-password` as never,
                    )
                  }
                >
                  <Text style={styles.actionChipText}>
                    {t('users.resetPassword')}
                  </Text>
                </Pressable>
                <Pressable
                  testID={`users.toggle.${user.id}`}
                  style={[
                    styles.actionChip,
                    togglingUserId === user.id && styles.actionChipDisabled,
                  ]}
                  disabled={Boolean(togglingUserId)}
                  onPress={() => {
                    setTogglingUserId(user.id);
                    toggleMutation.mutate(
                      {
                        id: user.id,
                        isActive: !user.isActive,
                      },
                      {
                        onSettled: () => setTogglingUserId(null),
                      },
                    );
                  }}
                >
                  <Text style={styles.actionChipText}>
                    {getToggleButtonLabel(
                      togglingUserId === user.id,
                      user.isActive,
                      t,
                    )}
                  </Text>
                </Pressable>
              </ScrollView>
            </View>
            <Text style={styles.detail}>
              {user.email ?? t('users.noEmail')}
            </Text>
            <Text style={styles.detail}>
              {(user.roles?.length ? user.roles : [user.role])
                .map((role) => t(`auth.roles.${role}`))
                .join(', ')}
            </Text>
          </View>
        ))}
      </View>
      <Pagination result={data} loading={isFetching} onPage={setPage} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
  },
  title: {
    fontWeight: '700',
    color: '#0f172a',
    maxWidth: '42%',
    marginRight: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  actionsScroller: {
    flex: 1,
  },
  detail: {
    color: '#475569',
  },
  inlineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
    gap: 6,
  },
  actionChip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionChipDisabled: {
    opacity: 0.6,
  },
  actionChipText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  error: {
    color: '#b91c1c',
  },
});

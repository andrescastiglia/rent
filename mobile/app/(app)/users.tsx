import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usersApi } from '@/api/users';
import { Screen } from '@/components/screen';

export default function UsersScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(1, 100),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      usersApi.setActivation(id, isActive),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('users.errors.activation'));
    },
  });

  return (
    <Screen>
      {isLoading ? <ActivityIndicator /> : null}
      {error ? <Text style={styles.error}>{(error as Error).message}</Text> : null}

      <View style={styles.list}>
        {(data?.data ?? []).map((user) => (
          <View key={user.id} testID={`users.item.${user.id}`} style={styles.card}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">{`${user.firstName} ${user.lastName}`}</Text>
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
                  onPress={() => router.push(`/(app)/users/${user.id}/edit` as never)}
                >
                  <Text style={styles.actionChipText}>{t('common.edit')}</Text>
                </Pressable>
                <Pressable
                  testID={`users.resetPassword.${user.id}`}
                  style={styles.actionChip}
                  disabled={Boolean(togglingUserId)}
                  onPress={() => router.push(`/(app)/users/${user.id}/reset-password` as never)}
                >
                  <Text style={styles.actionChipText}>{t('users.resetPassword')}</Text>
                </Pressable>
                <Pressable
                  testID={`users.toggle.${user.id}`}
                  style={[styles.actionChip, togglingUserId === user.id && styles.actionChipDisabled]}
                  disabled={Boolean(togglingUserId)}
                  onPress={() => {
                    setTogglingUserId(user.id);
                    void toggleMutation
                      .mutateAsync({
                        id: user.id,
                        isActive: !user.isActive,
                      })
                      .finally(() => setTogglingUserId(null));
                  }}
                >
                  <Text style={styles.actionChipText}>
                    {togglingUserId === user.id
                      ? t('common.saving')
                      : user.isActive
                        ? t('users.deactivate')
                        : t('users.activate')}
                  </Text>
                </Pressable>
              </ScrollView>
            </View>
            <Text style={styles.detail}>{user.email}</Text>
            <Text style={styles.detail}>{user.role}</Text>
          </View>
        ))}
      </View>
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

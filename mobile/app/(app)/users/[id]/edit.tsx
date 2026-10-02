import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { usersApi } from '@/api/users';
import { Screen } from '@/components/screen';
import { QueryStatus } from '@/components/query-status';
import { H1 } from '@/components/ui';
import { UserForm } from '@/screens/user-form';
import type { UpdateManagedUserInput } from '@/api/users';

export default function EditUserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const query = useQuery({
    queryKey: ['users', id],
    queryFn: () => usersApi.getById(id),
    enabled: Boolean(id),
  });

  const mutation = useMutation({
    mutationFn: (payload: UpdateManagedUserInput) =>
      usersApi.update(id, payload),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['users', id] });
      router.replace(`/(app)/users/${updated.id}` as never);
    },
    onError: (error) => {
      Alert.alert(
        t('common.error'),
        error instanceof Error ? error.message : t('users.errors.save'),
      );
    },
  });

  return (
    <Screen
      scrollViewTestID="userEdit.scroll"
      guidanceReady={!query.isLoading}
      guidanceBlocked={
        Boolean(query.error) || mutation.isPending || mutation.isError
      }
    >
      <H1>{t('common.edit')}</H1>
      <QueryStatus
        query={query}
        empty={!query.data}
        emptyLabel={t('users.noUsers')}
      />

      {query.data ? (
        <UserForm
          mode="edit"
          initial={query.data}
          submitLabel={t('common.save')}
          submitting={mutation.isPending}
          testIDPrefix="userEdit"
          onSubmit={async (payload) => {
            await mutation.mutateAsync(payload as UpdateManagedUserInput);
          }}
        />
      ) : null}
    </Screen>
  );
}

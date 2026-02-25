import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { usersApi } from '@/api/users';
import { Screen } from '@/components/screen';
import { H1 } from '@/components/ui';
import { UserForm } from '@/screens/user-form';
import type { CreateManagedUserInput } from '@/api/users';

export default function NewUserScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const mutation = useMutation({
    mutationFn: (payload: CreateManagedUserInput) => usersApi.create(payload),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      router.replace(`/(app)/users/${created.id}` as never);
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('users.errors.save'));
    },
  });

  return (
    <Screen scrollViewTestID="userCreate.scroll">
      <H1>{t('users.newUser')}</H1>
      <UserForm
        mode="create"
        submitLabel={t('users.newUser')}
        submitting={mutation.isPending}
        testIDPrefix="userCreate"
        onSubmit={async (payload) => {
          await mutation.mutateAsync(payload as CreateManagedUserInput);
        }}
      />
    </Screen>
  );
}

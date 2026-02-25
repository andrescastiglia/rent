import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { interestedApi } from '@/api/interested';
import { Screen } from '@/components/screen';
import { H1 } from '@/components/ui';
import { InterestedForm } from '@/screens/interested-form';
import type { CreateInterestedProfileInput } from '@/types/interested';

export default function NewInterestedScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const mutation = useMutation({
    mutationFn: (payload: CreateInterestedProfileInput) => interestedApi.create(payload),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['interested'] });
      router.replace(`/(app)/interested/${created.id}` as never);
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.saveError'));
    },
  });

  return (
    <Screen scrollViewTestID="interestedCreate.scroll">
      <H1>{t('interested.newTitle')}</H1>
      <InterestedForm
        mode="create"
        submitLabel={t('interested.actions.save')}
        submitting={mutation.isPending}
        testIDPrefix="interestedCreate"
        onSubmit={async (payload) => {
          await mutation.mutateAsync(payload as CreateInterestedProfileInput);
        }}
      />
    </Screen>
  );
}

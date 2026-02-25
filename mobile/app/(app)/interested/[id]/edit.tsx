import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { interestedApi } from '@/api/interested';
import { Screen } from '@/components/screen';
import { H1 } from '@/components/ui';
import { InterestedForm } from '@/screens/interested-form';
import type { UpdateInterestedProfileInput } from '@/types/interested';

export default function EditInterestedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const query = useQuery({
    queryKey: ['interested', id],
    queryFn: () => interestedApi.getById(id),
    enabled: Boolean(id),
  });

  const mutation = useMutation({
    mutationFn: (payload: UpdateInterestedProfileInput) => interestedApi.update(id, payload),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['interested'] });
      await queryClient.invalidateQueries({ queryKey: ['interested', id] });
      router.replace(`/(app)/interested/${updated.id}` as never);
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.saveError'));
    },
  });

  return (
    <Screen scrollViewTestID="interestedEdit.scroll">
      <H1>{t('interested.editTitle')}</H1>
      {query.isLoading ? <Text>{t('common.loading')}</Text> : null}
      {!query.isLoading && !query.data ? <Text>{t('interested.noResults')}</Text> : null}

      {query.data ? (
        <InterestedForm
          mode="edit"
          initial={query.data}
          submitLabel={t('interested.actions.save')}
          submitting={mutation.isPending}
          testIDPrefix="interestedEdit"
          onSubmit={async (payload) => {
            await mutation.mutateAsync(payload as UpdateInterestedProfileInput);
          }}
        />
      ) : null}
    </Screen>
  );
}

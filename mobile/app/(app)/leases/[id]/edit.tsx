import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { leasesApi } from '@/api/leases';
import { Screen } from '@/components/screen';
import { H1 } from '@/components/ui';
import { LeaseForm } from '@/screens/lease-form';
import type { UpdateLeaseInput } from '@/types/lease';

export default function EditLeaseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const query = useQuery({
    queryKey: ['leases', id],
    queryFn: () => leasesApi.getById(id),
    enabled: Boolean(id),
  });

  const mutation = useMutation({
    mutationFn: (payload: UpdateLeaseInput) => leasesApi.update(id, payload),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['leases'] });
      await queryClient.invalidateQueries({ queryKey: ['leases', id] });
      router.replace(`/(app)/leases/${updated.id}`);
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.saveError'));
    },
  });

  return (
    <Screen scrollViewTestID="leaseEdit.scroll">
      <H1>{t('leases.editLease')}</H1>
      {query.isLoading ? <Text>{t('common.loading')}</Text> : null}
      {!query.isLoading && !query.data ? <Text>{t('leases.notFound')}</Text> : null}

      {query.data ? (
        <LeaseForm
          mode="edit"
          initial={query.data}
          submitLabel={t('leases.saveLease')}
          submitting={mutation.isPending}
          testIDPrefix="leaseEdit"
          onSubmit={async (payload) => {
            await mutation.mutateAsync(payload as UpdateLeaseInput);
          }}
        />
      ) : null}
    </Screen>
  );
}

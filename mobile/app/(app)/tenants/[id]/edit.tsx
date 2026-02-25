import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { tenantsApi } from '@/api/tenants';
import { Screen } from '@/components/screen';
import { H1 } from '@/components/ui';
import { TenantForm } from '@/screens/tenant-form';
import type { UpdateTenantInput } from '@/types/tenant';

export default function EditTenantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const query = useQuery({
    queryKey: ['tenants', id],
    queryFn: () => tenantsApi.getById(id),
    enabled: Boolean(id),
  });

  const mutation = useMutation({
    mutationFn: (payload: UpdateTenantInput) => tenantsApi.update(id, payload),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['tenants', id] });
      router.replace(`/(app)/tenants/${updated.id}`);
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.saveError'));
    },
  });

  return (
    <Screen scrollViewTestID="tenantEdit.scroll">
      <H1>{t('tenants.editTenant')}</H1>
      {query.isLoading ? <Text>{t('common.loading')}</Text> : null}
      {!query.isLoading && !query.data ? <Text>{t('tenants.notFound')}</Text> : null}

      {query.data ? (
        <TenantForm
          mode="edit"
          initial={query.data}
          submitLabel={t('tenants.saveTenant')}
          submitting={mutation.isPending}
          testIDPrefix="tenantEdit"
          onSubmit={async (payload) => {
            await mutation.mutateAsync(payload as UpdateTenantInput);
          }}
        />
      ) : null}
    </Screen>
  );
}

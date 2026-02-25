import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { tenantsApi } from '@/api/tenants';
import { Screen } from '@/components/screen';
import { H1 } from '@/components/ui';
import { TenantForm } from '@/screens/tenant-form';
import type { CreateTenantInput } from '@/types/tenant';

export default function NewTenantScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const mutation = useMutation({
    mutationFn: (payload: CreateTenantInput) => tenantsApi.create(payload),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
      router.replace(`/(app)/tenants/${created.id}`);
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.saveError'));
    },
  });

  return (
    <Screen scrollViewTestID="tenantCreate.scroll">
      <H1>{t('tenants.newTenant')}</H1>
      <TenantForm
        mode="create"
        submitLabel={t('tenants.addTenant')}
        submitting={mutation.isPending}
        testIDPrefix="tenantCreate"
        onSubmit={async (payload) => {
          await mutation.mutateAsync(payload as CreateTenantInput);
        }}
      />
    </Screen>
  );
}

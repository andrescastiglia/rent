import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { leasesApi } from '@/api/leases';
import { Screen } from '@/components/screen';
import { H1 } from '@/components/ui';
import { LeaseForm } from '@/screens/lease-form';
import type { CreateLeaseInput } from '@/types/lease';

export default function NewLeaseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    propertyId?: string;
    ownerId?: string;
    tenantId?: string;
    buyerProfileId?: string;
    propertyOperations?: string;
    propertyName?: string;
    ownerName?: string;
    contractType?: 'rental' | 'sale';
  }>();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const mutation = useMutation({
    mutationFn: (payload: CreateLeaseInput) => leasesApi.create(payload),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['leases'] });
      router.replace(`/(app)/leases/${created.id}`);
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.saveError'));
    },
  });

  return (
    <Screen scrollViewTestID="leaseCreate.scroll">
      <H1>{t('leases.newLease')}</H1>
      <LeaseForm
        mode="create"
        defaultPropertyId={params.propertyId}
        defaultOwnerId={params.ownerId}
        preselectedTenantId={params.tenantId}
        preselectedBuyerProfileId={params.buyerProfileId}
        preselectedPropertyOperations={params.propertyOperations}
        preselectedPropertyName={params.propertyName}
        preselectedOwnerName={params.ownerName}
        preselectedContractType={params.contractType}
        submitLabel={t('leases.createLease')}
        submitting={mutation.isPending}
        testIDPrefix="leaseCreate"
        onSubmit={async (payload) => {
          await mutation.mutateAsync(payload as CreateLeaseInput);
        }}
      />
    </Screen>
  );
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { propertiesApi } from '@/api/properties';
import { Screen } from '@/components/screen';
import { H1 } from '@/components/ui';
import { PropertyForm } from '@/screens/property-form';
import type { CreatePropertyInput } from '@/types/property';

export default function NewPropertyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ownerId?: string }>();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const mutation = useMutation({
    mutationFn: (payload: CreatePropertyInput) => propertiesApi.create(payload),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['properties'] });
      router.replace(`/(app)/properties/${created.id}`);
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.saveError'));
    },
  });

  return (
    <Screen scrollViewTestID="propertyCreate.scroll">
      <H1>{t('properties.newProperty')}</H1>
      <PropertyForm
        mode="create"
        defaultOwnerId={params.ownerId}
        submitLabel={t('properties.addProperty')}
        submitting={mutation.isPending}
        testIDPrefix="propertyCreate"
        onSubmit={async (payload) => {
          await mutation.mutateAsync(payload as CreatePropertyInput);
        }}
      />
    </Screen>
  );
}

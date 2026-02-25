import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { propertiesApi } from '@/api/properties';
import { Screen } from '@/components/screen';
import { H1 } from '@/components/ui';
import { PropertyForm } from '@/screens/property-form';
import type { UpdatePropertyInput } from '@/types/property';

export default function EditPropertyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const query = useQuery({
    queryKey: ['properties', id],
    queryFn: () => propertiesApi.getById(id),
    enabled: Boolean(id),
  });

  const mutation = useMutation({
    mutationFn: (payload: UpdatePropertyInput) => propertiesApi.update(id, payload),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['properties'] });
      await queryClient.invalidateQueries({ queryKey: ['properties', id] });
      router.replace(`/(app)/properties/${updated.id}`);
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.saveError'));
    },
  });

  return (
    <Screen scrollViewTestID="propertyEdit.scroll">
      <H1>{t('properties.editProperty')}</H1>
      {query.isLoading ? <Text>{t('common.loading')}</Text> : null}
      {!query.isLoading && !query.data ? <Text>{t('properties.notFound')}</Text> : null}

      {query.data ? (
        <PropertyForm
          mode="edit"
          initial={query.data}
          submitLabel={t('properties.saveProperty')}
          submitting={mutation.isPending}
          testIDPrefix="propertyEdit"
          onSubmit={async (payload) => {
            await mutation.mutateAsync(payload as UpdatePropertyInput);
          }}
        />
      ) : null}
    </Screen>
  );
}

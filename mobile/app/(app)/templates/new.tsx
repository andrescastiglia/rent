import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { createTemplate } from '@/api/templates';
import { Screen } from '@/components/screen';
import { H1 } from '@/components/ui';
import { TemplateForm } from '@/screens/template-form';
import type { TemplateFormInput } from '@/screens/template-form';

export default function NewTemplateScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const mutation = useMutation({
    mutationFn: createTemplate,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
      router.replace(`/(app)/templates/${created.kind}/${created.id}` as never);
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.saveError'));
    },
  });

  return (
    <Screen scrollViewTestID="templateCreate.scroll">
      <H1>{t('templatesHub.newTemplate')}</H1>
      <TemplateForm
        mode="create"
        submitLabel={t('templatesHub.createTemplate')}
        submitting={mutation.isPending}
        testIDPrefix="templateCreate"
        onSubmit={async (payload) => {
          await mutation.mutateAsync(payload as TemplateFormInput);
        }}
      />
    </Screen>
  );
}

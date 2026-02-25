import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { getTemplate, updateTemplate, type TemplateKind } from '@/api/templates';
import { Screen } from '@/components/screen';
import { H1 } from '@/components/ui';
import { TemplateForm } from '@/screens/template-form';
import type { TemplateFormInput } from '@/screens/template-form';

const isTemplateKind = (value: string): value is TemplateKind => value === 'lease' || value === 'payment';

export default function EditTemplateScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const validKind = isTemplateKind(kind) ? kind : null;

  const query = useQuery({
    queryKey: ['templates', validKind, id],
    queryFn: () => getTemplate(validKind as TemplateKind, id),
    enabled: Boolean(id && validKind),
  });

  const mutation = useMutation({
    mutationFn: (payload: Omit<TemplateFormInput, 'kind'>) =>
      updateTemplate(validKind as TemplateKind, id, payload),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
      await queryClient.invalidateQueries({ queryKey: ['templates', validKind, id] });
      router.replace(`/(app)/templates/${updated.kind}/${updated.id}` as never);
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.saveError'));
    },
  });

  return (
    <Screen scrollViewTestID="templateEdit.scroll">
      <H1>{t('templatesHub.editTemplate')}</H1>
      {!validKind ? <Text>{t('common.error')}</Text> : null}
      {query.isLoading ? <Text>{t('common.loading')}</Text> : null}
      {!query.isLoading && validKind && !query.data ? <Text>{t('templatesHub.templateNotFound')}</Text> : null}

      {query.data ? (
        <TemplateForm
          mode="edit"
          initial={query.data}
          submitLabel={t('common.save')}
          submitting={mutation.isPending}
          testIDPrefix="templateEdit"
          onSubmit={async (payload) => {
            const { kind: _kind, ...rest } = payload as TemplateFormInput;
            await mutation.mutateAsync(rest);
          }}
        />
      ) : null}
    </Screen>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { deleteTemplate, getTemplate, type TemplateKind } from '@/api/templates';
import { Screen } from '@/components/screen';
import { AppButton, H1 } from '@/components/ui';

const isTemplateKind = (value: string): value is TemplateKind => value === 'lease' || value === 'payment';

export default function TemplateDetailScreen() {
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

  const deleteMutation = useMutation({
    mutationFn: () => deleteTemplate(validKind as TemplateKind, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
      router.replace('/(app)/templates');
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.deleteError'));
    },
  });

  const template = query.data;

  return (
    <Screen>
      <H1>{t('templatesHub.listTitle')}</H1>
      {!validKind ? <Text>{t('common.error')}</Text> : null}
      {query.isLoading ? <Text>{t('common.loading')}</Text> : null}
      {query.error ? <Text style={styles.error}>{(query.error as Error).message}</Text> : null}
      {!query.isLoading && validKind && !template ? <Text>{t('templatesHub.templateNotFound')}</Text> : null}

      {template ? (
        <View style={styles.card}>
          <Text style={styles.title}>{template.name}</Text>
          <Text style={styles.detail}>{`${t('common.details')}: ${template.kind === 'lease' ? t('leases.title') : t('templatesHub.title')}`}</Text>
          <Text style={styles.detail}>
            {template.kind === 'lease'
              ? `${t('leases.fields.contractType')}: ${template.contractType ?? '-'}`
              : `${t('templatesHub.scopes.invoice')}: ${template.paymentType ?? '-'}`}
          </Text>
          <Text style={styles.detail}>{template.isActive ? t('templatesHub.active') : t('templatesHub.inactive')}</Text>
          {template.kind === 'payment' ? (
            <Text style={styles.detail}>{template.isDefault ? t('templatesHub.defaultLabel') : '-'}</Text>
          ) : null}
          <Text style={styles.body}>{template.templateBody}</Text>
        </View>
      ) : null}

      {template ? (
        <View style={styles.actions}>
          <AppButton
            title={t('common.edit')}
            onPress={() => router.push(`/(app)/templates/${template.kind}/${template.id}/edit` as never)}
            testID="templateDetail.edit"
          />
          <AppButton
            title={t('common.delete')}
            variant="secondary"
            loading={deleteMutation.isPending}
            testID="templateDetail.delete"
            onPress={() => {
              Alert.alert(t('common.delete'), t('messages.deleteConfirm'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('common.delete'), style: 'destructive', onPress: () => deleteMutation.mutate() },
              ]);
            }}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 12,
    gap: 6,
  },
  title: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 18,
  },
  detail: {
    color: '#334155',
  },
  body: {
    marginTop: 6,
    color: '#0f172a',
    lineHeight: 20,
  },
  actions: {
    marginTop: 16,
    gap: 10,
  },
  error: {
    color: '#b91c1c',
  },
});

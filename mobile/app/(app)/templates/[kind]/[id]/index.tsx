import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  deleteTemplate,
  getTemplate,
  type TemplateKind,
} from '@/api/templates';
import { Screen } from '@/components/screen';
import { AppButton, H1 } from '@/components/ui';

const isTemplateKind = (value: string): value is TemplateKind =>
  value === 'lease' || value === 'payment';

const requireTemplateKind = (kind: TemplateKind | null): TemplateKind => {
  if (!kind) {
    throw new Error('Invalid template kind');
  }

  return kind;
};

const getTemplateKindDescription = (
  kind: TemplateKind,
  t: ReturnType<typeof useTranslation>['t'],
): string => (kind === 'lease' ? t('leases.title') : t('templatesHub.title'));

const getTemplateTypeDescription = (
  template: NonNullable<Awaited<ReturnType<typeof getTemplate>>>,
  t: ReturnType<typeof useTranslation>['t'],
): string =>
  template.kind === 'lease'
    ? `${t('leases.fields.contractType')}: ${template.contractType ?? '-'}`
    : `${t('templatesHub.scopes.invoice')}: ${template.paymentType ?? '-'}`;

const getTemplateErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

type TemplateDetailTranslations = ReturnType<typeof useTranslation>['t'];

function TemplateSummaryCard({
  template,
  t,
}: Readonly<{
  template: NonNullable<Awaited<ReturnType<typeof getTemplate>>>;
  t: TemplateDetailTranslations;
}>) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{template.name}</Text>
      <Text style={styles.detail}>
        {`${t('common.details')}: ${getTemplateKindDescription(template.kind, t)}`}
      </Text>
      <Text style={styles.detail}>
        {getTemplateTypeDescription(template, t)}
      </Text>
      <Text style={styles.detail}>
        {template.isActive
          ? t('templatesHub.active')
          : t('templatesHub.inactive')}
      </Text>
      {template.kind === 'payment' ? (
        <Text style={styles.detail}>
          {template.isDefault ? t('templatesHub.defaultLabel') : '-'}
        </Text>
      ) : null}
      <Text style={styles.body}>{template.templateBody}</Text>
    </View>
  );
}

function TemplateActions({
  loading,
  onEdit,
  onDelete,
  t,
}: Readonly<{
  loading: boolean;
  onEdit: () => void;
  onDelete: () => void;
  t: TemplateDetailTranslations;
}>) {
  return (
    <View style={styles.actions}>
      <AppButton
        title={t('common.edit')}
        onPress={onEdit}
        testID="templateDetail.edit"
      />
      <AppButton
        title={t('common.delete')}
        variant="secondary"
        loading={loading}
        testID="templateDetail.delete"
        onPress={onDelete}
      />
    </View>
  );
}

export default function TemplateDetailScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const validKind = isTemplateKind(kind) ? kind : null;
  const resolvedKind = validKind ? requireTemplateKind(validKind) : null;

  const query = useQuery({
    queryKey: ['templates', validKind, id],
    queryFn: () => getTemplate(requireTemplateKind(validKind), id),
    enabled: Boolean(id && resolvedKind),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTemplate(requireTemplateKind(validKind), id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
      router.replace('/(app)/templates');
    },
    onError: (error) => {
      Alert.alert(
        t('common.error'),
        error instanceof Error ? error.message : t('messages.deleteError'),
      );
    },
  });

  const template = query.data;
  const errorMessage = getTemplateErrorMessage(
    query.error,
    t('messages.loadError'),
  );

  if (!validKind) {
    return (
      <Screen>
        <H1>{t('templatesHub.listTitle')}</H1>
        <Text>{t('common.error')}</Text>
      </Screen>
    );
  }

  const handleEdit = () => {
    if (!template) {
      return;
    }

    router.push(`/(app)/templates/${template.kind}/${template.id}/edit`);
  };
  const handleDelete = () => {
    Alert.alert(t('common.delete'), t('messages.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => deleteMutation.mutate(),
      },
    ]);
  };

  return (
    <Screen>
      <H1>{t('templatesHub.listTitle')}</H1>
      {query.isLoading ? <Text>{t('common.loading')}</Text> : null}
      {query.error ? <Text style={styles.error}>{errorMessage}</Text> : null}
      {!query.isLoading && !template ? (
        <Text>{t('templatesHub.templateNotFound')}</Text>
      ) : null}

      {template ? <TemplateSummaryCard template={template} t={t} /> : null}

      {template ? (
        <TemplateActions
          loading={deleteMutation.isPending}
          onEdit={handleEdit}
          onDelete={handleDelete}
          t={t}
        />
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

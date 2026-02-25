import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { listTemplates } from '@/api/templates';
import { Screen } from '@/components/screen';
import { AppButton, ChoiceGroup } from '@/components/ui';
import type { PaymentDocumentTemplateType } from '@/types/payment';

type PaymentTypeFilter = PaymentDocumentTemplateType | 'all';

export default function TemplatesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<PaymentTypeFilter>('all');

  const paymentTypeOptions: Array<{ label: string; value: PaymentTypeFilter }> = [
    { label: t('payments.allStatuses'), value: 'all' },
    { label: t('templatesHub.scopes.receipt'), value: 'receipt' },
    { label: t('templatesHub.scopes.invoice'), value: 'invoice' },
    { label: t('templatesHub.scopes.creditNote'), value: 'credit_note' },
  ];
  const { data, isLoading, error } = useQuery({
    queryKey: ['templates'],
    queryFn: () => listTemplates(),
  });

  const filteredTemplates = useMemo(
    () =>
      (data ?? []).filter((template) => {
        if (paymentTypeFilter === 'all') return true;
        return template.kind === 'payment' && template.paymentType === paymentTypeFilter;
      }),
    [data, paymentTypeFilter],
  );

  return (
    <Screen>
      <View style={styles.filters}>
        <ChoiceGroup
          label={t('templatesHub.scopes.invoice')}
          value={paymentTypeFilter}
          onChange={setPaymentTypeFilter}
          options={paymentTypeOptions}
          testID="templates.filter.paymentType"
        />
      </View>

      {isLoading ? <ActivityIndicator /> : null}
      {error ? <Text style={styles.error}>{(error as Error).message}</Text> : null}

      <View style={styles.list}>
        {filteredTemplates.map((template) => (
          <View key={`${template.kind}-${template.id}`} testID={`templates.item.${template.kind}.${template.id}`} style={styles.card}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{template.name}</Text>
              <AppButton
                title={t('common.edit')}
                variant="secondary"
                onPress={() => router.push(`/(app)/templates/${template.kind}/${template.id}/edit` as never)}
                testID={`templates.edit.${template.kind}.${template.id}`}
              />
            </View>
            <Text style={styles.detail}>{template.kind === 'lease' ? t('leases.title') : t('templatesHub.title')}</Text>
            <Text style={styles.detail}>
              {template.kind === 'lease'
                ? `${t('common.filter')}: ${template.contractType ?? '-'}`
                : `${t('common.filter')}: ${template.paymentType ?? '-'}`}
            </Text>
            <Text style={styles.detail}>{template.isActive ? t('templatesHub.active') : t('templatesHub.inactive')}</Text>
          </View>
        ))}
        {!isLoading && filteredTemplates.length === 0 ? (
          <Text style={styles.empty}>{t('templatesHub.empty')}</Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: {
    marginBottom: 12,
  },
  list: {
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
  },
  title: {
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
    marginRight: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  detail: {
    color: '#475569',
  },
  empty: {
    color: '#475569',
    textAlign: 'center',
    marginTop: 8,
  },
  error: {
    color: '#b91c1c',
  },
});

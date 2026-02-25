import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ownersApi } from '@/api/owners';
import { Screen } from '@/components/screen';
import { AppButton, DateField, Field, H1 } from '@/components/ui';
import { i18n } from '@/i18n';

const toDateInput = (value?: string | null) => (value ? value.slice(0, 10) : new Date().toISOString().slice(0, 10));

const formatAmount = (amount: number, currencyCode = 'ARS') =>
  new Intl.NumberFormat(i18n.language || 'es', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(amount);

export default function OwnerPayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const ownerQuery = useQuery({
    queryKey: ['owners', id],
    queryFn: () => ownersApi.getById(id),
    enabled: Boolean(id),
  });

  const settlementsQuery = useQuery({
    queryKey: ['owners', 'settlements', id],
    queryFn: () => ownersApi.getSettlements(id, 'all', 50),
    enabled: Boolean(id),
  });

  const pendingSettlements = useMemo(
    () =>
      (settlementsQuery.data ?? []).filter(
        (item) => item.status === 'pending' || item.status === 'processing',
      ),
    [settlementsQuery.data],
  );

  const completedSettlements = useMemo(
    () => (settlementsQuery.data ?? []).filter((item) => item.status === 'completed'),
    [settlementsQuery.data],
  );

  const [settlementId, setSettlementId] = useState('');
  const [paymentDate, setPaymentDate] = useState(toDateInput());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!settlementId && pendingSettlements[0]) {
      setSettlementId(pendingSettlements[0].id);
    }
  }, [pendingSettlements, settlementId]);

  const selectedSettlement = useMemo(
    () => pendingSettlements.find((item) => item.id === settlementId) ?? null,
    [pendingSettlements, settlementId],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      if (!id || !selectedSettlement) {
        throw new Error(t('properties.ownerNoPendingSettlements'));
      }

      return ownersApi.registerSettlementPayment(id, selectedSettlement.id, {
        amount: selectedSettlement.netAmount,
        paymentDate,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['owners', 'settlements', id] });
      await queryClient.invalidateQueries({ queryKey: ['owners', 'settlements'] });
      Alert.alert(t('common.success'), `${t('properties.ownerSettlement')} ${result.period}`);
      router.back();
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.saveError'));
    },
  });

  return (
    <Screen>
      <H1>{t('properties.registerOwnerPayment')}</H1>
      <Text style={styles.subtitle}>
        {ownerQuery.data ? `${ownerQuery.data.firstName} ${ownerQuery.data.lastName}` : `${t('properties.ownersTitle')} ${id}`}
      </Text>

      <Text style={styles.sectionTitle}>{t('properties.ownerNoPendingSettlements')}</Text>
      {pendingSettlements.length === 0 ? (
        <Text style={styles.empty}>{t('properties.ownerNoPendingSettlements')}</Text>
      ) : (
        <View style={styles.list}>
          {pendingSettlements.map((settlement) => {
            const selected = settlement.id === selectedSettlement?.id;
            return (
              <Pressable
                key={settlement.id}
                style={[styles.settlementCard, selected && styles.settlementCardSelected]}
                onPress={() => setSettlementId(settlement.id)}
                testID={`ownerPay.settlement.${settlement.id}`}
              >
                <Text style={styles.settlementPeriod}>{settlement.period}</Text>
                <Text style={styles.settlementAmount}>{formatAmount(settlement.netAmount, settlement.currencyCode)}</Text>
                <Text style={styles.settlementMeta}>{`${t('payments.amount')}: ${formatAmount(settlement.grossAmount, settlement.currencyCode)} · ${t('dashboard.stats.monthlyCommissions')}: ${formatAmount(settlement.commissionAmount, settlement.currencyCode)}`}</Text>
                <Text style={styles.settlementStatus}>{settlement.status}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {selectedSettlement ? (
        <View style={styles.formBlock}>
          <View style={styles.amountBox} testID="ownerPay.amount">
            <Text style={styles.amountLabel}>{t('properties.amountToPay')}</Text>
            <Text style={styles.amountValue}>
              {formatAmount(selectedSettlement.netAmount, selectedSettlement.currencyCode)}
            </Text>
          </View>
          <DateField
            label={t('properties.paymentDate')}
            value={paymentDate}
            onChange={setPaymentDate}
            testID="ownerPay.paymentDate"
          />
          <Field label={t('properties.reference')} value={reference} onChangeText={setReference} testID="ownerPay.reference" />
          <Field label={t('properties.notes')} value={notes} onChangeText={setNotes} testID="ownerPay.notes" />

          <View style={styles.actions}>
            <AppButton
              title={t('properties.registerPayment')}
              onPress={() => mutation.mutate()}
              loading={mutation.isPending}
              testID="ownerPay.submit"
            />
          </View>
        </View>
      ) : null}

      <View style={styles.history}>
        <Text style={styles.sectionTitle}>{t('properties.ownerRecentPayments')}</Text>
        {completedSettlements.length === 0 ? <Text style={styles.empty}>{t('properties.ownerNoRecentPayments')}</Text> : null}
        {completedSettlements.map((settlement) => (
          <View key={settlement.id} style={styles.historyCard}>
            <Text style={styles.historyPeriod}>{settlement.period}</Text>
            <Text style={styles.historyAmount}>{formatAmount(settlement.netAmount, settlement.currencyCode)}</Text>
            <AppButton
              title={t('properties.downloadOwnerReceipt')}
              variant="secondary"
              onPress={() => {
                void ownersApi.downloadSettlementReceipt(settlement.ownerId, settlement.id);
              }}
              testID={`ownerPay.download.${settlement.id}`}
            />
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: '#334155',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#0f172a',
    fontWeight: '700',
    marginBottom: 8,
  },
  empty: {
    color: '#64748b',
    marginBottom: 12,
  },
  list: {
    gap: 8,
  },
  settlementCard: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#fff',
    padding: 10,
    gap: 4,
  },
  settlementCardSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  settlementPeriod: {
    color: '#0f172a',
    fontWeight: '700',
  },
  settlementAmount: {
    color: '#0f172a',
    fontWeight: '700',
  },
  settlementMeta: {
    color: '#334155',
    fontSize: 12,
  },
  settlementStatus: {
    color: '#0369a1',
    textTransform: 'uppercase',
    fontSize: 11,
    fontWeight: '700',
  },
  formBlock: {
    marginTop: 12,
  },
  amountBox: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  amountLabel: {
    color: '#1f2937',
    fontWeight: '600',
    marginBottom: 4,
  },
  amountValue: {
    color: '#0f172a',
    fontWeight: '700',
  },
  actions: {
    marginTop: 8,
  },
  history: {
    marginTop: 16,
    gap: 8,
  },
  historyCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  historyPeriod: {
    color: '#0f172a',
    fontWeight: '700',
  },
  historyAmount: {
    color: '#334155',
  },
});

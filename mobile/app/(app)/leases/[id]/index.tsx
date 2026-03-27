import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { leasesApi } from '@/api/leases';
import { propertiesApi } from '@/api/properties';
import { tenantsApi } from '@/api/tenants';
import { Screen } from '@/components/screen';
import { AppButton, H1 } from '@/components/ui';
import { i18n } from '@/i18n';
import type { Lease } from '@/types/lease';
import type { Property } from '@/types/property';
import type { Tenant } from '@/types/tenant';

const formatMoney = (amount?: number, currencyCode = 'ARS'): string =>
  amount === undefined
    ? '-'
    : new Intl.NumberFormat(i18n.language || 'es', {
        style: 'currency',
        currency: currencyCode,
        maximumFractionDigits: 0,
      }).format(amount);

const formatDate = (value?: string): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString(i18n.language || 'es');
};

type LeaseDetailTranslations = ReturnType<typeof useTranslation>['t'];

function LeaseSummaryCard({
  lease,
  t,
}: Readonly<{ lease: Lease; t: LeaseDetailTranslations }>) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {lease.contractType === 'rental'
          ? t('leases.leaseAgreement')
          : t('leases.contractTypes.sale')}
      </Text>
      <Text style={styles.badge}>{t(`leases.status.${lease.status}`)}</Text>
    </View>
  );
}

function LeasePartyCard({
  lease,
  property,
  personName,
  personEmail,
  personPhone,
  t,
}: Readonly<{
  lease: Lease;
  property: Property | null;
  personName: string;
  personEmail?: string;
  personPhone?: string;
  t: LeaseDetailTranslations;
}>) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t('leases.propertyAndTenant')}</Text>
      <Text style={styles.detail}>
        {property?.name || t('leases.unknownProperty')}
      </Text>
      {property?.address ? (
        <Text style={styles.detail}>
          {`${property.address.street} ${property.address.number}, ${property.address.city}`}
        </Text>
      ) : null}
      <Text style={styles.subsectionLabel}>
        {lease.contractType === 'rental'
          ? t('leases.fields.tenant')
          : t('leases.fields.buyer')}
      </Text>
      <Text style={styles.detail}>{personName}</Text>
      {personEmail ? <Text style={styles.detail}>{personEmail}</Text> : null}
      {personPhone ? <Text style={styles.detail}>{personPhone}</Text> : null}
    </View>
  );
}

function LeaseFinancialCard({
  lease,
  t,
}: Readonly<{ lease: Lease; t: LeaseDetailTranslations }>) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t('leases.financialDetails')}</Text>
      {lease.contractType === 'rental' ? (
        <>
          <Text style={styles.detail}>
            {`${t('leases.rentAmount')}: ${formatMoney(lease.rentAmount, lease.currency)}`}
          </Text>
          <Text style={styles.detail}>
            {`${t('leases.securityDeposit')}: ${formatMoney(lease.depositAmount, lease.currency)}`}
          </Text>
        </>
      ) : (
        <Text style={styles.detail}>
          {`${t('leases.fields.fiscalValue')}: ${formatMoney(lease.fiscalValue, lease.currency)}`}
        </Text>
      )}
    </View>
  );
}

function LeaseDurationCard({
  lease,
  t,
}: Readonly<{ lease: Lease; t: LeaseDetailTranslations }>) {
  if (lease.contractType !== 'rental') {
    return null;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t('leases.duration')}</Text>
      <Text style={styles.detail}>
        {`${t('leases.startDate')}: ${formatDate(lease.startDate)}`}
      </Text>
      <Text style={styles.detail}>
        {`${t('leases.endDate')}: ${formatDate(lease.endDate)}`}
      </Text>
    </View>
  );
}

function LeaseDraftCard({
  lease,
  draftText,
  onChangeDraftText,
  onRenderDraft,
  onSaveDraft,
  onConfirmDraft,
  renderingDraft,
  savingDraft,
  confirmingDraft,
  t,
}: Readonly<{
  lease: Lease;
  draftText: string;
  onChangeDraftText: (value: string) => void;
  onRenderDraft: () => void;
  onSaveDraft: () => void;
  onConfirmDraft: () => void;
  renderingDraft: boolean;
  savingDraft: boolean;
  confirmingDraft: boolean;
  t: LeaseDetailTranslations;
}>) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>
        {lease.status === 'DRAFT'
          ? t('leases.draft.title')
          : t('leases.confirmedTextTitle')}
      </Text>
      {lease.status === 'DRAFT' ? (
        <>
          <TextInput
            testID="leaseDetail.draftInput"
            style={styles.textArea}
            multiline
            value={draftText}
            onChangeText={onChangeDraftText}
            placeholder={t('leases.leaseTermsPlaceholder')}
          />
          <View style={styles.inlineActions}>
            <AppButton
              title={t('leases.draft.renderFromTemplate')}
              variant="secondary"
              loading={renderingDraft}
              testID="leaseDetail.renderDraft"
              onPress={onRenderDraft}
            />
            <AppButton
              title={t('leases.draft.saveDraft')}
              loading={savingDraft}
              testID="leaseDetail.saveDraft"
              onPress={onSaveDraft}
            />
            <AppButton
              title={t('leases.draft.confirm')}
              loading={confirmingDraft}
              testID="leaseDetail.confirmDraft"
              onPress={onConfirmDraft}
            />
          </View>
        </>
      ) : (
        <Text style={styles.detail}>
          {lease.confirmedContractText ||
            lease.draftContractText ||
            t('leases.draft.empty')}
        </Text>
      )}
    </View>
  );
}

function LeaseDocumentsCard({
  lease,
  downloadingContract,
  onDownloadContract,
  t,
}: Readonly<{
  lease: Lease;
  downloadingContract: boolean;
  onDownloadContract: () => void;
  t: LeaseDetailTranslations;
}>) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t('leases.documents')}</Text>
      {lease.documents.length > 0 ? (
        lease.documents.map((doc, index) => (
          <Text key={`${doc}-${index}`} style={styles.linkLike}>
            {`${t('leases.document')} ${index + 1}: ${doc}`}
          </Text>
        ))
      ) : (
        <View style={styles.inlineActions}>
          <Text style={styles.detail}>{t('leases.noDocuments')}</Text>
          <AppButton
            title={t('leases.downloadContract')}
            variant="secondary"
            loading={downloadingContract}
            testID="leaseDetail.downloadContract"
            onPress={onDownloadContract}
          />
        </View>
      )}
    </View>
  );
}

function LeaseActions({
  leaseId,
  deleting,
  onEdit,
  onDelete,
  t,
}: Readonly<{
  leaseId: string;
  deleting: boolean;
  onEdit: (leaseId: string) => void;
  onDelete: () => void;
  t: LeaseDetailTranslations;
}>) {
  return (
    <View style={styles.actions}>
      <AppButton
        title={t('leases.editLease')}
        onPress={() => onEdit(leaseId)}
        testID="leaseDetail.edit"
      />
      <AppButton
        title={t('leases.deleteLease')}
        variant="secondary"
        loading={deleting}
        testID="leaseDetail.delete"
        onPress={onDelete}
      />
    </View>
  );
}

export default function LeaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [draftText, setDraftText] = useState('');

  const leaseQuery = useQuery({
    queryKey: ['leases', id],
    queryFn: () => leasesApi.getById(id),
    enabled: Boolean(id),
  });

  const lease = leaseQuery.data;

  const propertyQuery = useQuery({
    queryKey: ['properties', 'by-id', lease?.propertyId],
    queryFn: () => propertiesApi.getById(lease?.propertyId ?? ''),
    enabled: Boolean(lease?.propertyId && !lease?.property),
  });

  const tenantQuery = useQuery({
    queryKey: ['tenants', 'by-id', lease?.tenantId],
    queryFn: () => tenantsApi.getById(lease?.tenantId ?? ''),
    enabled: Boolean(lease?.tenantId && !lease?.tenant),
  });

  useEffect(() => {
    if (lease?.draftContractText !== undefined) {
      setDraftText(lease.draftContractText ?? '');
    }
  }, [lease?.draftContractText]);

  const renderDraftMutation = useMutation({
    mutationFn: () => leasesApi.renderDraft(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['leases', id] });
    },
    onError: () => {
      Alert.alert(t('common.error'), t('messages.saveError'));
    },
  });

  const saveDraftMutation = useMutation({
    mutationFn: () =>
      leasesApi.updateDraftText(
        id,
        draftText,
        lease?.draftContractFormat ?? 'plain_text',
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['leases', id] });
      Alert.alert(t('common.success'), t('leases.draft.saveDraft'));
    },
    onError: () => {
      Alert.alert(t('common.error'), t('messages.saveError'));
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () =>
      leasesApi.confirmDraft(
        id,
        draftText,
        lease?.draftContractFormat ?? 'plain_text',
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['leases', id] });
      await queryClient.invalidateQueries({ queryKey: ['leases'] });
      Alert.alert(t('common.success'), t('leases.confirmedTextTitle'));
    },
    onError: () => {
      Alert.alert(t('common.error'), t('messages.saveError'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => leasesApi.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['leases'] });
      router.replace('/(app)/(tabs)/leases');
    },
    onError: () => {
      Alert.alert(t('common.error'), t('leases.deleteError'));
    },
  });

  const downloadMutation = useMutation({
    mutationFn: () => leasesApi.downloadContract(id),
    onError: () => {
      Alert.alert(t('common.error'), t('messages.loadError'));
    },
  });

  const property = lease?.property ?? propertyQuery.data ?? null;
  const tenant: Tenant | null = lease?.tenant ?? tenantQuery.data ?? null;
  const buyer = lease?.buyer ?? null;
  const errorMessage =
    leaseQuery.error instanceof Error
      ? leaseQuery.error.message
      : t('messages.loadError');

  const personName = useMemo(() => {
    if (!lease) return '-';

    if (lease.contractType === 'rental') {
      const fullName =
        `${tenant?.firstName ?? ''} ${tenant?.lastName ?? ''}`.trim();
      return fullName || tenant?.email || t('leases.unknownTenant');
    }

    const fullName =
      `${buyer?.firstName ?? ''} ${buyer?.lastName ?? ''}`.trim();
    return fullName || buyer?.email || buyer?.phone || t('leases.selectBuyer');
  }, [
    buyer?.email,
    buyer?.firstName,
    buyer?.lastName,
    buyer?.phone,
    lease,
    tenant?.email,
    tenant?.firstName,
    tenant?.lastName,
  ]);

  const personEmail =
    lease?.contractType === 'rental' ? tenant?.email : buyer?.email;
  const personPhone =
    lease?.contractType === 'rental' ? tenant?.phone : buyer?.phone;

  const handleEditLease = (leaseId: string) => {
    router.push(`/(app)/leases/${leaseId}/edit`);
  };
  const handleDeleteLease = () => {
    Alert.alert(t('leases.deleteLease'), t('leases.confirmDelete'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => deleteMutation.mutate(),
      },
    ]);
  };

  return (
    <Screen scrollViewTestID="leaseDetail.scroll">
      <H1>{t('leases.leaseDetails')}</H1>
      {leaseQuery.isLoading ? <Text>{t('common.loading')}</Text> : null}
      {leaseQuery.error ? (
        <Text style={styles.error}>{errorMessage}</Text>
      ) : null}
      {!leaseQuery.isLoading && !lease ? (
        <Text>{t('leases.notFound')}</Text>
      ) : null}

      {lease ? (
        <>
          <LeaseSummaryCard lease={lease} t={t} />
          <LeasePartyCard
            lease={lease}
            property={property}
            personName={personName}
            personEmail={personEmail ?? undefined}
            personPhone={personPhone ?? undefined}
            t={t}
          />
          <LeaseFinancialCard lease={lease} t={t} />
          <LeaseDurationCard lease={lease} t={t} />
          <LeaseDraftCard
            lease={lease}
            draftText={draftText}
            onChangeDraftText={setDraftText}
            onRenderDraft={() => renderDraftMutation.mutate()}
            onSaveDraft={() => saveDraftMutation.mutate()}
            onConfirmDraft={() => confirmMutation.mutate()}
            renderingDraft={renderDraftMutation.isPending}
            savingDraft={saveDraftMutation.isPending}
            confirmingDraft={confirmMutation.isPending}
            t={t}
          />

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              {t('leases.termsAndConditions')}
            </Text>
            <Text style={styles.detail}>
              {lease.terms || t('leases.noTerms')}
            </Text>
          </View>

          <LeaseDocumentsCard
            lease={lease}
            downloadingContract={downloadMutation.isPending}
            onDownloadContract={() => downloadMutation.mutate()}
            t={t}
          />
          <LeaseActions
            leaseId={lease.id}
            deleting={deleteMutation.isPending}
            onEdit={handleEditLease}
            onDelete={handleDeleteLease}
            t={t}
          />
        </>
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
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e2e8f0',
    color: '#0f172a',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: '#0f172a',
    fontWeight: '700',
    marginBottom: 2,
  },
  subsectionLabel: {
    color: '#334155',
    fontWeight: '700',
    marginTop: 4,
  },
  detail: {
    color: '#334155',
  },
  linkLike: {
    color: '#1d4ed8',
  },
  inlineActions: {
    gap: 8,
  },
  actions: {
    marginTop: 16,
    gap: 10,
  },
  textArea: {
    minHeight: 160,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#fff',
    padding: 12,
    textAlignVertical: 'top',
    color: '#0f172a',
  },
  error: {
    color: '#b91c1c',
  },
});

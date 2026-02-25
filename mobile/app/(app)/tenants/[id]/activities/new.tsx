import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { tenantsApi } from '@/api/tenants';
import { whatsappApi } from '@/api/whatsapp';
import { Screen } from '@/components/screen';
import { AppButton, ChoiceGroup, Field, H1 } from '@/components/ui';
import type { TenantActivityType } from '@/types/tenant';

export default function NewTenantActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();

  const activityTypeOptions: Array<{ label: string; value: TenantActivityType }> = [
    { label: t('tenants.activityTypes.task'), value: 'task' },
    { label: t('tenants.activityTypes.call'), value: 'call' },
    { label: t('tenants.activityTypes.note'), value: 'note' },
    { label: t('tenants.activityTypes.whatsapp'), value: 'whatsapp' },
    { label: t('tenants.activityTypes.visit'), value: 'visit' },
    { label: t('tenants.activityTypes.email'), value: 'email' },
  ];

  const tenantQuery = useQuery({
    queryKey: ['tenants', id],
    queryFn: () => tenantsApi.getById(id),
    enabled: Boolean(id),
  });

  const [type, setType] = useState<TenantActivityType>('task');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [includeDueAt, setIncludeDueAt] = useState(false);
  const [dueAt, setDueAt] = useState(new Date());
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [showPicker, setShowPicker] = useState(false);

  const handlePickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }
    if (event.type === 'dismissed' || !selected) {
      return;
    }
    setDueAt(selected);
    if (Platform.OS === 'ios') {
      setShowPicker(false);
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!id) {
        throw new Error(t('common.error'));
      }
      if (!subject.trim()) {
        throw new Error(t('tenants.errors.activitySubjectRequired'));
      }
      if (type === 'whatsapp' && !tenantQuery.data?.phone?.trim()) {
        throw new Error(t('tenants.fields.phone'));
      }

      const created = await tenantsApi.createActivity(id, {
        type,
        subject: subject.trim(),
        body: body.trim() || undefined,
        dueAt: includeDueAt ? dueAt.toISOString() : undefined,
      });

      if (type === 'whatsapp' && tenantQuery.data?.phone?.trim()) {
        const text = [subject.trim(), body.trim()].filter(Boolean).join('\n\n');
        await whatsappApi.sendMessage({
          to: tenantQuery.data.phone.trim(),
          text,
        });
      }

      return created;
    },
    onSuccess: () => {
      Alert.alert(t('common.success'));
      router.replace(`/(app)/tenants/${id}` as never);
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.saveError'));
    },
  });

  const tenantName = `${tenantQuery.data?.firstName ?? ''} ${tenantQuery.data?.lastName ?? ''}`.trim();

  return (
    <Screen>
      <H1>{t('tenants.activities.add')}</H1>
      {tenantName ? <Text style={styles.subtitle}>{tenantName}</Text> : null}

      <ChoiceGroup
        label={t('tenants.activities.title')}
        value={type}
        onChange={setType}
        options={activityTypeOptions}
        testID="tenantActivityCreate.type"
      />

      <Field label={t('tenants.activities.subject')} value={subject} onChangeText={setSubject} testID="tenantActivityCreate.subject" />

      <View style={styles.fieldContainer}>
        <Text style={styles.fieldLabel}>{t('tenants.activities.body')}</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          style={styles.textArea}
          multiline
          numberOfLines={4}
          testID="tenantActivityCreate.body"
        />
      </View>

      <View style={styles.fieldContainer}>
        <AppButton
          title={includeDueAt ? t('common.cancel') : t('tenants.activities.dueAt')}
          variant="secondary"
          onPress={() => setIncludeDueAt((current) => !current)}
          testID="tenantActivityCreate.toggleDueAt"
        />
      </View>

      {includeDueAt ? (
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>{t('tenants.activities.dueAt')}</Text>
          <View style={styles.dateTimeRow}>
            <Pressable
              onPress={() => {
                setPickerMode('date');
                setShowPicker(true);
              }}
              style={styles.dateTimeButton}
              testID="tenantActivityCreate.dueAt.date"
            >
              <Text style={styles.dateTimeButtonLabel}>{t('payments.date')}</Text>
              <Text style={styles.dateTimeButtonValue}>{dueAt.toLocaleDateString()}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setPickerMode('time');
                setShowPicker(true);
              }}
              style={styles.dateTimeButton}
              testID="tenantActivityCreate.dueAt.time"
            >
              <Text style={styles.dateTimeButtonLabel}>{t('dashboard.peopleActivity.columns.dueAt')}</Text>
              <Text style={styles.dateTimeButtonValue}>
                {dueAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </Pressable>
          </View>
          {showPicker ? (
            <DateTimePicker
              value={dueAt}
              mode={pickerMode}
              is24Hour
              onChange={handlePickerChange}
              testID="tenantActivityCreate.dueAt.picker"
            />
          ) : null}
        </View>
      ) : null}

      <AppButton
        title={t('tenants.activities.add')}
        onPress={() => mutation.mutate()}
        loading={mutation.isPending}
        testID="tenantActivityCreate.submit"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: '#334155',
    marginBottom: 8,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    marginBottom: 8,
    color: '#1f2937',
    fontWeight: '600',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    color: '#111827',
    textAlignVertical: 'top',
    minHeight: 96,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateTimeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateTimeButtonLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  dateTimeButtonValue: {
    color: '#0f172a',
    fontWeight: '700',
  },
});

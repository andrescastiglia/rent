import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { interestedApi } from '@/api/interested';
import { Screen } from '@/components/screen';
import { AppButton, ChoiceGroup, DateField, H1 } from '@/components/ui';
import type { InterestedActivityStatus, InterestedActivityType } from '@/types/interested';

export default function NewInterestedActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const activityTypeOptions: Array<{ label: string; value: InterestedActivityType }> = [
    { label: t('interested.activityTypes.task'), value: 'task' },
    { label: t('interested.activityTypes.call'), value: 'call' },
    { label: t('interested.activityTypes.note'), value: 'note' },
    { label: t('interested.activityTypes.whatsapp'), value: 'whatsapp' },
    { label: t('interested.activityTypes.visit'), value: 'visit' },
    { label: t('interested.activityTypes.email'), value: 'email' },
  ];

  const activityStatusOptions: Array<{ label: string; value: InterestedActivityStatus }> = [
    { label: t('interested.activityStatus.pending'), value: 'pending' },
    { label: t('interested.activityStatus.completed'), value: 'completed' },
    { label: t('interested.activityStatus.cancelled'), value: 'cancelled' },
  ];

  const [type, setType] = useState<InterestedActivityType>('task');
  const [status, setStatus] = useState<InterestedActivityStatus>('pending');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [dueAt, setDueAt] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      if (!id) {
        throw new Error(t('common.error'));
      }
      if (!subject.trim()) {
        throw new Error(t('interested.errors.activitySubjectRequired'));
      }

      return interestedApi.addActivity(id, {
        type,
        status,
        subject: subject.trim(),
        body: body.trim() || undefined,
        dueAt: dueAt || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['interested'] });
      Alert.alert(t('common.success'));
      router.back();
    },
    onError: (error) => {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('messages.saveError'));
    },
  });

  return (
    <Screen>
      <H1>{t('interested.activities.add')}</H1>

      <ChoiceGroup
        label={t('interested.activities.title')}
        value={type}
        onChange={setType}
        options={activityTypeOptions}
        testID="interestedActivityCreate.type"
      />

      <ChoiceGroup
        label={t('tenants.leaseStatus')}
        value={status}
        onChange={setStatus}
        options={activityStatusOptions}
        testID="interestedActivityCreate.status"
      />

      <View style={styles.fieldContainer}>
        <Text style={styles.label}>{t('interested.activities.subject')}</Text>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          style={styles.input}
          testID="interestedActivityCreate.subject"
        />
      </View>

      <View style={styles.fieldContainer}>
        <Text style={styles.label}>{t('interested.activities.body')}</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          style={[styles.input, styles.textArea]}
          multiline
          numberOfLines={4}
          testID="interestedActivityCreate.body"
        />
      </View>

      <DateField
        label={`${t('interested.activities.add')} (${t('common.optional')})`}
        value={dueAt}
        onChange={setDueAt}
        testID="interestedActivityCreate.dueAt"
      />

      <AppButton
        title={t('common.save')}
        onPress={() => mutation.mutate()}
        loading={mutation.isPending}
        testID="interestedActivityCreate.submit"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fieldContainer: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
    color: '#1f2937',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    color: '#111827',
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
});

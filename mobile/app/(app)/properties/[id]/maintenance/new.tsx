import { Pressable, Text, View } from '@/components/themed-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DateTimePicker, {
  DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { propertiesApi } from '@/api/properties';
import { QueryStatus } from '@/components/query-status';
import { Screen } from '@/components/screen';
import { AppButton, Field, H1 } from '@/components/ui';

export default function NewPropertyMaintenanceTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const propertyQuery = useQuery({
    queryKey: ['properties', id],
    queryFn: () => propertiesApi.getById(id),
    enabled: Boolean(id),
  });

  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState(new Date());
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [showPicker, setShowPicker] = useState(false);
  const [notes, setNotes] = useState('');

  const handlePickerChange = (
    _event: DateTimePickerChangeEvent,
    selected?: Date,
  ) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }
    if (!selected) {
      return;
    }
    setScheduledAt(selected);
    if (Platform.OS === 'ios') {
      setShowPicker(false);
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!id) {
        throw new Error(t('common.error'));
      }
      if (!title.trim()) {
        throw new Error(t('properties.maintenanceErrors.titleRequired'));
      }

      return propertiesApi.createMaintenanceTask(id, {
        title: title.trim(),
        scheduledAt: scheduledAt.toISOString(),
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['properties', id, 'maintenance'],
      });
      router.replace(`/(app)/properties/${id}` as never);
    },
    onError: (error) => {
      Alert.alert(
        t('common.error'),
        error instanceof Error ? error.message : t('messages.saveError'),
      );
    },
  });

  if (propertyQuery.isLoading || propertyQuery.isError || !propertyQuery.data)
    return (
      <QueryStatus
        query={propertyQuery}
        empty={!propertyQuery.data}
        emptyLabel={t('common.notFound')}
      />
    );

  return (
    <Screen
      guidanceReady={!propertyQuery.isLoading}
      guidanceBlocked={
        propertyQuery.isError ||
        mutation.isPending ||
        mutation.isError ||
        showPicker
      }
    >
      <H1>{t('properties.saveMaintenanceTask')}</H1>
      <Text style={styles.subtitle}>
        {propertyQuery.data?.name ?? `${t('properties.title')} ${id}`}
      </Text>

      <Field
        label={t('properties.fields.taskTitle')}
        value={title}
        onChangeText={setTitle}
        testID="maintenanceCreate.title"
      />
      <Text style={styles.fieldLabel}>{t('payments.date')}</Text>
      <View style={styles.dateTimeRow}>
        <Pressable
          onPress={() => {
            setPickerMode('date');
            setShowPicker(true);
          }}
          style={styles.dateTimeButton}
          testID="maintenanceCreate.scheduledAt.date"
        >
          <Text style={styles.dateTimeButtonLabel}>{t('payments.date')}</Text>
          <Text style={styles.dateTimeButtonValue}>
            {scheduledAt.toLocaleDateString()}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setPickerMode('time');
            setShowPicker(true);
          }}
          style={styles.dateTimeButton}
          testID="maintenanceCreate.scheduledAt.time"
        >
          <Text style={styles.dateTimeButtonLabel}>
            {t('dashboard.peopleActivity.columns.dueAt')}
          </Text>
          <Text style={styles.dateTimeButtonValue}>
            {scheduledAt.toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </Pressable>
      </View>
      {showPicker ? (
        <DateTimePicker
          value={scheduledAt}
          mode={pickerMode}
          is24Hour
          onValueChange={handlePickerChange}
          onDismiss={() => setShowPicker(false)}
          testID="maintenanceCreate.scheduledAt.picker"
        />
      ) : null}
      <Field
        label={t('properties.fields.taskNotes')}
        value={notes}
        onChangeText={setNotes}
        testID="maintenanceCreate.notes"
      />

      <View style={styles.actions}>
        <AppButton
          title={t('properties.saveMaintenanceTask')}
          onPress={() => mutation.mutate()}
          loading={mutation.isPending}
          disabled={
            !propertyQuery.data ||
            propertyQuery.isLoading ||
            propertyQuery.isError
          }
          testID="maintenanceCreate.submit"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: '#334155',
    marginBottom: 8,
  },
  fieldLabel: {
    marginBottom: 8,
    color: '#1f2937',
    fontWeight: '600',
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
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
  actions: {
    marginTop: 8,
  },
});

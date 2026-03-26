import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { propertiesApi } from '@/api/properties';
import { Screen } from '@/components/screen';
import { AppButton, Field } from '@/components/ui';

export default function NewPropertyVisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const propertyQuery = useQuery({
    queryKey: ['properties', id],
    queryFn: () => propertiesApi.getById(id),
    enabled: Boolean(id),
  });

  const [interestedName, setInterestedName] = useState('');
  const [comments, setComments] = useState('');
  const [hasOffer, setHasOffer] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerCurrency, setOfferCurrency] = useState('ARS');
  const [visitedAt, setVisitedAt] = useState(new Date());
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [showPicker, setShowPicker] = useState(false);

  const handlePickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }
    if (event.type === 'dismissed' || !selected) {
      return;
    }

    if (pickerMode === 'date') {
      const next = new Date(visitedAt);
      next.setFullYear(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate(),
      );
      setVisitedAt(next);
    } else {
      const next = new Date(visitedAt);
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setVisitedAt(next);
    }

    if (Platform.OS === 'ios') {
      setShowPicker(false);
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!id) {
        throw new Error(t('common.error'));
      }
      if (!interestedName.trim()) {
        throw new Error('El nombre del interesado es obligatorio.');
      }
      if (hasOffer && (!offerAmount || Number(offerAmount) <= 0)) {
        throw new Error(
          'Si la visita tiene oferta, el monto debe ser mayor a cero.',
        );
      }

      return propertiesApi.createVisit(id, {
        interestedName: interestedName.trim(),
        comments: comments.trim() || undefined,
        visitedAt: visitedAt.toISOString(),
        hasOffer,
        offerAmount: hasOffer ? Number(offerAmount) : undefined,
        offerCurrency: hasOffer ? offerCurrency : undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['properties', id, 'visits'],
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

  return (
    <Screen>
      <Text style={styles.title}>
        {t('properties.registerVisit', { defaultValue: 'Registrar visita' })}
      </Text>
      <Text style={styles.subtitle}>
        {propertyQuery.data?.name ?? `${t('properties.title')} ${id}`}
      </Text>

      <Field
        label="Interesado"
        value={interestedName}
        onChangeText={setInterestedName}
        placeholder="Nombre y apellido"
        testID="visitCreate.interestedName"
      />

      <Text style={styles.fieldLabel}>Fecha y hora</Text>
      <View style={styles.dateTimeRow}>
        <Pressable
          onPress={() => {
            setPickerMode('date');
            setShowPicker(true);
          }}
          style={styles.dateTimeButton}
          testID="visitCreate.visitedAt.date"
        >
          <Text style={styles.dateTimeButtonLabel}>Fecha</Text>
          <Text style={styles.dateTimeButtonValue}>
            {visitedAt.toLocaleDateString()}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setPickerMode('time');
            setShowPicker(true);
          }}
          style={styles.dateTimeButton}
          testID="visitCreate.visitedAt.time"
        >
          <Text style={styles.dateTimeButtonLabel}>Hora</Text>
          <Text style={styles.dateTimeButtonValue}>
            {visitedAt.toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </Pressable>
      </View>
      {showPicker ? (
        <DateTimePicker
          value={visitedAt}
          mode={pickerMode}
          is24Hour
          onChange={handlePickerChange}
          testID="visitCreate.visitedAt.picker"
        />
      ) : null}

      <Field
        label="Comentarios"
        value={comments}
        onChangeText={setComments}
        placeholder="Interés, condiciones, observaciones"
        testID="visitCreate.comments"
      />

      <Pressable
        style={styles.checkboxRow}
        onPress={() => setHasOffer((current) => !current)}
        testID="visitCreate.hasOffer"
      >
        <View style={[styles.checkbox, hasOffer && styles.checkboxChecked]}>
          {hasOffer ? <Text style={styles.checkboxTick}>✓</Text> : null}
        </View>
        <Text style={styles.checkboxLabel}>La visita incluyó una oferta</Text>
      </Pressable>

      {hasOffer ? (
        <>
          <Field
            label="Monto de oferta"
            value={offerAmount}
            onChangeText={setOfferAmount}
            keyboardType="numeric"
            testID="visitCreate.offerAmount"
          />
          <Field
            label="Moneda"
            value={offerCurrency}
            onChangeText={setOfferCurrency}
            autoCapitalize="characters"
            testID="visitCreate.offerCurrency"
          />
        </>
      ) : null}

      <AppButton
        title={t('properties.registerVisit', {
          defaultValue: 'Registrar visita',
        })}
        onPress={() => mutation.mutate()}
        loading={mutation.isPending}
        testID="visitCreate.submit"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: '#0f172a',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: '#334155',
    marginTop: 4,
    marginBottom: 12,
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
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxChecked: {
    backgroundColor: '#1d4ed8',
    borderColor: '#1d4ed8',
  },
  checkboxTick: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  checkboxLabel: {
    color: '#0f172a',
    fontWeight: '600',
  },
});

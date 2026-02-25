import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, ChoiceGroup, Field } from '@/components/ui';
import type {
  CreateInterestedProfileInput,
  InterestedOperation,
  InterestedPropertyType,
  InterestedProfile,
  UpdateInterestedProfileInput,
} from '@/types/interested';

type FormValues = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  peopleCount: string;
  minAmount: string;
  maxAmount: string;
  hasPets: boolean;
  preferredCity: string;
  desiredFeaturesCsv: string;
  propertyTypePreference: InterestedPropertyType;
  operation: InterestedOperation;
  operations: InterestedOperation[];
  notes: string;
};

type InterestedFormProps = {
  mode: 'create' | 'edit';
  initial?: InterestedProfile;
  submitting?: boolean;
  onSubmit: (payload: CreateInterestedProfileInput | UpdateInterestedProfileInput) => Promise<void>;
  submitLabel: string;
  testIDPrefix?: string;
};

const emptyForm: FormValues = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  peopleCount: '',
  minAmount: '',
  maxAmount: '',
  hasPets: false,
  preferredCity: '',
  desiredFeaturesCsv: '',
  propertyTypePreference: 'apartment',
  operation: 'rent',
  operations: ['rent'],
  notes: '',
};

const operationOptions = [
  { label: 'Alquiler', value: 'rent' as const },
  { label: 'Venta', value: 'sale' as const },
];

const propertyTypeOptions = [
  { label: 'Departamento', value: 'apartment' as const },
  { label: 'Casa', value: 'house' as const },
  { label: 'Comercial', value: 'commercial' as const },
  { label: 'Oficina', value: 'office' as const },
  { label: 'Depósito', value: 'warehouse' as const },
  { label: 'Terreno', value: 'land' as const },
  { label: 'Cochera', value: 'parking' as const },
  { label: 'Otro', value: 'other' as const },
];

const toggleOperation = (
  form: FormValues,
  operation: InterestedOperation,
  checked: boolean,
): FormValues => {
  const current = form.operations ?? [];
  const operations = checked
    ? [...new Set([...current, operation])]
    : current.filter((item) => item !== operation);

  return {
    ...form,
    operations,
    operation: operations[0] ?? 'rent',
  };
};

const toOptionalNumber = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const splitFeatures = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const profileToForm = (profile?: InterestedProfile): FormValues => {
  if (!profile) return emptyForm;
  const operations =
    profile.operations ?? (profile.operation ? [profile.operation] : ['rent']);

  return {
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    phone: profile.phone ?? '',
    email: profile.email ?? '',
    peopleCount: profile.peopleCount?.toString() ?? '',
    minAmount: profile.minAmount?.toString() ?? '',
    maxAmount: profile.maxAmount?.toString() ?? '',
    hasPets: profile.hasPets ?? false,
    preferredCity: profile.preferredCity ?? '',
    desiredFeaturesCsv: (profile.desiredFeatures ?? []).join(', '),
    propertyTypePreference: profile.propertyTypePreference ?? 'apartment',
    operation: profile.operation ?? operations[0] ?? 'rent',
    operations,
    notes: profile.notes ?? '',
  };
};

export function InterestedForm({
  mode,
  initial,
  submitting,
  onSubmit,
  submitLabel,
  testIDPrefix = 'interestedForm',
}: InterestedFormProps) {
  const { t } = useTranslation();
  const defaults = useMemo(() => profileToForm(initial), [initial]);
  const [form, setForm] = useState<FormValues>(defaults);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(defaults);
    setError(null);
  }, [defaults]);

  const getNormalizedOperations = (currentForm: FormValues): InterestedOperation[] => {
    if (currentForm.operations.length > 0) {
      return Array.from(new Set(currentForm.operations));
    }
    if (currentForm.operation) {
      return [currentForm.operation];
    }
    return ['rent'];
  };

  const submit = async () => {
    if (!form.phone.trim()) {
      setError(t('interested.errors.phoneRequired'));
      return;
    }
    setError(null);

    const normalizedOperations = getNormalizedOperations(form);

    const payload: CreateInterestedProfileInput = {
      firstName: form.firstName.trim() || undefined,
      lastName: form.lastName.trim() || undefined,
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      peopleCount: toOptionalNumber(form.peopleCount),
      minAmount: toOptionalNumber(form.minAmount),
      maxAmount: toOptionalNumber(form.maxAmount),
      hasPets: form.hasPets,
      preferredCity: form.preferredCity.trim() || undefined,
      desiredFeatures: splitFeatures(form.desiredFeaturesCsv),
      propertyTypePreference: form.propertyTypePreference,
      operation: normalizedOperations[0],
      operations: normalizedOperations,
      notes: form.notes.trim() || undefined,
    };

    if (mode === 'edit') {
      await onSubmit(payload as UpdateInterestedProfileInput);
      return;
    }

    await onSubmit(payload);
  };

  return (
    <View>
      <Field
        label={t('interested.fields.firstName')}
        value={form.firstName}
        onChangeText={(firstName) => setForm((prev) => ({ ...prev, firstName }))}
        testID={`${testIDPrefix}.firstName`}
      />
      <Field
        label={t('interested.fields.lastName')}
        value={form.lastName}
        onChangeText={(lastName) => setForm((prev) => ({ ...prev, lastName }))}
        testID={`${testIDPrefix}.lastName`}
      />
      <Field
        label={t('interested.fields.phone')}
        value={form.phone}
        onChangeText={(phone) => setForm((prev) => ({ ...prev, phone }))}
        keyboardType="phone-pad"
        testID={`${testIDPrefix}.phone`}
      />
      <Field
        label={t('interested.fields.email')}
        value={form.email}
        onChangeText={(email) => setForm((prev) => ({ ...prev, email }))}
        autoCapitalize="none"
        keyboardType="email-address"
        testID={`${testIDPrefix}.email`}
      />

      <View style={styles.fieldContainer}>
        <Text style={styles.fieldLabel}>{t('interested.fields.operations')}</Text>
        <View style={styles.operationsContainer}>
          {operationOptions.map((option) => {
            const selected = form.operations.includes(option.value);
            return (
              <Pressable
                key={option.value}
                testID={`${testIDPrefix}.operation.${option.value}`}
                style={[styles.operationChip, selected && styles.operationChipSelected]}
                onPress={() => setForm((prev) => toggleOperation(prev, option.value, !selected))}
              >
                <Text style={[styles.operationChipText, selected && styles.operationChipTextSelected]}>
                  {t(`interested.operations.${option.value}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ChoiceGroup
        label={t('properties.fields.type')}
        value={form.propertyTypePreference}
        onChange={(propertyTypePreference) => setForm((prev) => ({ ...prev, propertyTypePreference }))}
        options={propertyTypeOptions.map((option) => ({
          value: option.value,
          label: t(`interested.propertyTypes.${option.value}`),
        }))}
        testID={`${testIDPrefix}.propertyTypePreference`}
      />
      <Field
        label={t('interested.fields.peopleCount')}
        value={form.peopleCount}
        onChangeText={(peopleCount) => setForm((prev) => ({ ...prev, peopleCount }))}
        keyboardType="numeric"
        testID={`${testIDPrefix}.peopleCount`}
      />
      <Field
        label={t('interested.fields.minAmount')}
        value={form.minAmount}
        onChangeText={(minAmount) => setForm((prev) => ({ ...prev, minAmount }))}
        keyboardType="numeric"
        testID={`${testIDPrefix}.minAmount`}
      />
      <Field
        label={t('interested.fields.maxAmount')}
        value={form.maxAmount}
        onChangeText={(maxAmount) => setForm((prev) => ({ ...prev, maxAmount }))}
        keyboardType="numeric"
        testID={`${testIDPrefix}.maxAmount`}
      />
      <Field
        label={t('interested.fields.preferredCity')}
        value={form.preferredCity}
        onChangeText={(preferredCity) => setForm((prev) => ({ ...prev, preferredCity }))}
        testID={`${testIDPrefix}.preferredCity`}
      />
      <Field
        label={t('interested.fields.desiredFeatures')}
        value={form.desiredFeaturesCsv}
        onChangeText={(desiredFeaturesCsv) => setForm((prev) => ({ ...prev, desiredFeaturesCsv }))}
        testID={`${testIDPrefix}.desiredFeatures`}
      />

      <View style={styles.fieldContainer}>
        <View style={styles.switchRow}>
          <Text style={styles.fieldLabel}>{t('interested.fields.hasPets')}</Text>
          <Switch
            testID={`${testIDPrefix}.hasPets`}
            value={form.hasPets}
            onValueChange={(hasPets) => setForm((prev) => ({ ...prev, hasPets }))}
          />
        </View>
      </View>

      <Field
        label={t('interested.fields.notes')}
        value={form.notes}
        onChangeText={(notes) => setForm((prev) => ({ ...prev, notes }))}
        testID={`${testIDPrefix}.notes`}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <AppButton
        title={submitLabel}
        onPress={submit}
        loading={submitting}
        disabled={submitting}
        testID={`${testIDPrefix}.submit`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    marginBottom: 8,
    color: '#1f2937',
    fontWeight: '600',
  },
  operationsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  operationChip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    marginRight: 8,
    marginBottom: 8,
  },
  operationChipSelected: {
    borderColor: '#1d4ed8',
    backgroundColor: '#dbeafe',
  },
  operationChipText: {
    color: '#1f2937',
    fontWeight: '600',
  },
  operationChipTextSelected: {
    color: '#1e40af',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  error: {
    color: '#b91c1c',
    marginBottom: 6,
  },
});

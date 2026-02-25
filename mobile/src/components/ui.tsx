import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSegments } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

type ButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
  testID?: string;
};

export function AppButton({ title, onPress, disabled, loading, variant = 'primary', testID }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      testID={testID}
      style={[styles.button, variant === 'secondary' && styles.secondaryButton, isDisabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? '#1f2a37' : '#ffffff'} />
      ) : (
        <Text style={[styles.buttonText, variant === 'secondary' && styles.secondaryButtonText]}>{title}</Text>
      )}
    </Pressable>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  editable?: boolean;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric';
  testID?: string;
};

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  editable = true,
  secureTextEntry,
  autoCapitalize = 'sentences',
  keyboardType = 'default',
  testID,
}: FieldProps) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        style={[styles.input, !editable && styles.inputDisabled]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        editable={editable}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
      />
    </View>
  );
}

type DateFieldProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  testID?: string;
};

const parseDateInput = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
};

const formatDateInput = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function DateField({ label, value, onChange, placeholder = 'YYYY-MM-DD', testID }: DateFieldProps) {
  const [showPicker, setShowPicker] = useState(false);

  const selectedDate = useMemo(() => parseDateInput(value) ?? new Date(), [value]);

  const handlePickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }
    if (event.type === 'dismissed' || !selected) {
      return;
    }
    onChange(formatDateInput(selected));
    if (Platform.OS === 'ios') {
      setShowPicker(false);
    }
  };

  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        testID={testID}
        style={styles.input}
        onPress={() => setShowPicker(true)}
      >
        <Text style={value ? styles.inputValue : styles.inputPlaceholder}>
          {value || placeholder}
        </Text>
      </Pressable>
      {showPicker ? (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handlePickerChange}
          testID={testID ? `${testID}.picker` : undefined}
        />
      ) : null}
    </View>
  );
}

export function H1({ children }: Readonly<{ children: React.ReactNode }>) {
  const segments = useSegments() as string[];
  // In protected app routes the native stack header already renders the title.
  if (segments.includes('(app)')) {
    return null;
  }
  return <Text style={styles.h1}>{children}</Text>;
}

export function Body({ children }: Readonly<{ children: React.ReactNode }>) {
  return <Text style={styles.body}>{children}</Text>;
}

type ChoiceOption<T extends string> = {
  label: string;
  value: T;
};

type ChoiceGroupProps<T extends string> = {
  label: string;
  value: T;
  options: Array<ChoiceOption<T>>;
  onChange: (next: T) => void;
  testID?: string;
};

export function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  testID,
}: ChoiceGroupProps<T>) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.choicesContainer}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              testID={testID ? `${testID}.${option.value}` : undefined}
              key={option.value}
              style={[styles.choiceChip, selected && styles.choiceChipSelected]}
              onPress={() => onChange(option.value)}
            >
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  body: {
    fontSize: 16,
    color: '#334155',
    marginBottom: 20,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
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
  inputDisabled: {
    backgroundColor: '#f1f5f9',
    color: '#64748b',
  },
  inputValue: {
    color: '#111827',
  },
  inputPlaceholder: {
    color: '#94a3b8',
  },
  button: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  secondaryButton: {
    backgroundColor: '#e2e8f0',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  secondaryButtonText: {
    color: '#1f2937',
  },
  choicesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  choiceChipSelected: {
    borderColor: '#1d4ed8',
    backgroundColor: '#dbeafe',
  },
  choiceText: {
    color: '#1f2937',
    fontWeight: '600',
  },
  choiceTextSelected: {
    color: '#1e40af',
  },
});

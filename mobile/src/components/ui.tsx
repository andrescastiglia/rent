import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from '@/components/themed-native';
import { useTheme } from '@/contexts/theme-context';
import {
  GuidanceControlHint,
  useGuidanceBlocker,
  useGuidanceControl,
  useGuidanceInteraction,
} from '@/components/guidance';
import { designTokens as tokens } from '@/config/design-tokens';
import DateTimePicker, {
  DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import { useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, type TextInputProps } from 'react-native';

type ButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
  testID?: string;
};

export function AppButton({
  title,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  testID,
}: Readonly<ButtonProps>) {
  const interact = useGuidanceInteraction();
  const isDisabled = disabled || loading;
  const hinted = useGuidanceControl({
    id: testID ?? `action:${title}`,
    label: title,
    kind: 'action',
    enabled: !isDisabled,
    complete: true,
  });
  return (
    <View>
      <Pressable
        testID={testID}
        style={[
          styles.button,
          variant === 'secondary' && styles.secondaryButton,
          isDisabled && styles.buttonDisabled,
          hinted && styles.guidanceTarget,
        ]}
        onPress={() => {
          interact();
          onPress();
        }}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{
          disabled: Boolean(isDisabled),
          busy: Boolean(loading),
        }}
      >
        {loading ? (
          <ActivityIndicator
            color={variant === 'secondary' ? '#1f2a37' : '#ffffff'}
          />
        ) : (
          <Text
            style={[
              styles.buttonText,
              variant === 'secondary' && styles.secondaryButtonText,
            ]}
          >
            {title}
          </Text>
        )}
      </Pressable>
      <GuidanceControlHint active={hinted} label={title} />
    </View>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  editable?: boolean;
  secureTextEntry?: boolean;
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
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
  autoComplete,
  textContentType,
  autoCapitalize = 'sentences',
  keyboardType = 'default',
  testID,
}: Readonly<FieldProps>) {
  const { t } = useTranslation();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const interact = useGuidanceInteraction();
  const hinted = useGuidanceControl({
    id: testID ?? `field:${label}`,
    label,
    kind: 'field',
    enabled: editable,
    complete: Boolean(value.trim()),
  });
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          testID={testID}
          style={[
            styles.input,
            styles.inputFill,
            !editable && styles.inputDisabled,
            hinted && styles.guidanceTarget,
          ]}
          value={value}
          onChangeText={(value) => {
            interact();
            onChangeText(value);
          }}
          placeholder={placeholder}
          editable={editable}
          secureTextEntry={secureTextEntry && !passwordVisible}
          autoComplete={autoComplete}
          textContentType={textContentType}
          autoCapitalize={secureTextEntry ? 'none' : autoCapitalize}
          autoCorrect={secureTextEntry ? false : undefined}
          keyboardType={keyboardType}
          accessibilityLabel={label}
          accessibilityState={{ disabled: !editable }}
        />
        {secureTextEntry ? (
          <Pressable
            testID={`${testID ?? label}.toggleVisibility`}
            accessibilityRole="button"
            accessibilityLabel={t(
              passwordVisible ? 'common.hidePassword' : 'common.showPassword',
            )}
            accessibilityState={{ disabled: !editable }}
            disabled={!editable}
            onPress={() => {
              interact();
              setPasswordVisible((visible) => !visible);
            }}
            style={styles.passwordToggle}
          >
            <Text>{t(passwordVisible ? 'common.hide' : 'common.show')}</Text>
          </Pressable>
        ) : null}
      </View>
      <GuidanceControlHint active={hinted} label={label} />
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

export function DateField({
  label,
  value,
  onChange,
  placeholder = 'YYYY-MM-DD',
  testID,
}: Readonly<DateFieldProps>) {
  const { mode } = useTheme();
  const [showPicker, setShowPicker] = useState(false);
  const hinted = useGuidanceControl({
    id: testID ?? `date:${label}`,
    label,
    kind: 'field',
    enabled: true,
    complete: Boolean(value),
  });
  useGuidanceBlocker(`${testID ?? label}.picker`, showPicker);

  const selectedDate = useMemo(
    () => parseDateInput(value) ?? new Date(),
    [value],
  );

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
        style={[styles.input, hinted && styles.guidanceTarget]}
        onPress={() => setShowPicker(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={value || placeholder}
        accessibilityState={{ expanded: showPicker }}
      >
        <Text style={value ? styles.inputValue : styles.inputPlaceholder}>
          {value || placeholder}
        </Text>
      </Pressable>
      <GuidanceControlHint active={hinted} label={label} />
      {showPicker ? (
        <DateTimePicker
          themeVariant={mode}
          value={selectedDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onValueChange={handlePickerChange}
          onDismiss={() => setShowPicker(false)}
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
  return (
    <Text style={styles.h1} accessibilityRole="header">
      {children}
    </Text>
  );
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
}: Readonly<ChoiceGroupProps<T>>) {
  const interact = useGuidanceInteraction();
  const hinted = useGuidanceControl({
    id: testID ?? `choice:${label}`,
    label,
    kind: 'field',
    enabled: options.length > 0,
    complete: Boolean(value),
  });
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View
        style={styles.choicesContainer}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              testID={testID ? `${testID}.${option.value}` : undefined}
              key={option.value}
              style={[
                styles.choiceChip,
                selected && styles.choiceChipSelected,
                hinted && styles.guidanceTarget,
              ]}
              onPress={() => {
                interact();
                onChange(option.value);
              }}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: selected }}
            >
              <Text
                style={[
                  styles.choiceText,
                  selected && styles.choiceTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <GuidanceControlHint active={hinted} label={label} />
    </View>
  );
}

type MultiChoiceGroupProps<T extends string> = {
  label: string;
  values: T[];
  options: Array<ChoiceOption<T>>;
  onChange: (next: T[]) => void;
  lockedValues?: T[];
  testID?: string;
};

export function MultiChoiceGroup<T extends string>({
  label,
  values,
  options,
  onChange,
  lockedValues = [],
  testID,
}: Readonly<MultiChoiceGroupProps<T>>) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.choicesContainer} accessibilityLabel={label}>
        {options.map((option) => {
          const selected = values.includes(option.value);
          const locked = lockedValues.includes(option.value);
          return (
            <Pressable
              testID={testID ? `${testID}.${option.value}` : undefined}
              key={option.value}
              style={[
                styles.choiceChip,
                selected && styles.choiceChipSelected,
                locked && styles.choiceChipLocked,
              ]}
              onPress={() =>
                onChange(
                  selected
                    ? values.filter((value) => value !== option.value)
                    : [...values, option.value],
                )
              }
              disabled={locked}
              accessibilityRole="checkbox"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: selected, disabled: locked }}
            >
              <Text
                style={[
                  styles.choiceText,
                  selected && styles.choiceTextSelected,
                ]}
              >
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
  guidanceTarget: { borderWidth: 2, borderColor: tokens.colors.primary },
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
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputFill: { flex: 1, minWidth: 0 },
  passwordToggle: {
    minHeight: tokens.touchTarget,
    minWidth: tokens.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
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
    minHeight: tokens.touchTarget,
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
    minHeight: tokens.touchTarget,
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  choiceChipSelected: {
    borderColor: '#1d4ed8',
    backgroundColor: '#dbeafe',
  },
  choiceChipLocked: {
    opacity: 0.75,
  },
  choiceText: {
    color: '#1f2937',
    fontWeight: '600',
  },
  choiceTextSelected: {
    color: '#1e40af',
  },
});

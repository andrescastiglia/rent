import { forwardRef } from 'react';
import {
  Text as NativeText,
  View as NativeView,
  Pressable as NativePressable,
  TextInput as NativeTextInput,
  ScrollView as NativeScrollView,
  FlatList as NativeFlatList,
  ActivityIndicator as NativeActivityIndicator,
  KeyboardAvoidingView as NativeKeyboardAvoidingView,
  StyleSheet,
  type TextProps,
  type ViewProps,
  type PressableProps,
  type TextInputProps,
  type ScrollViewProps,
  type FlatListProps,
  type ActivityIndicatorProps,
  type KeyboardAvoidingViewProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  type ImageStyle,
} from 'react-native';
import { useTheme, type ThemeColors } from '@/contexts/theme-context';

const colorGroups = {
  text: new Set([
    '#0f172a',
    '#111827',
    '#1f2937',
    '#1f2a37',
    '#202832',
    '#202b37',
    '#1e293b',
    '#334155',
    '#374151',
  ]),
  muted: new Set([
    '#475569',
    '#526170',
    '#586574',
    '#64748b',
    '#94a3b8',
    '#4b5563',
  ]),
  border: new Set(['#e2e8f0', '#cbd5e1', '#d1d5db', '#d9dee7', '#dce2e6']),
  background: new Set(['#f8fafc', '#f7f8fa', '#f5f5f2']),
  surfaceMuted: new Set(['#f1f5f9', '#f2f4f5']),
  primary: new Set([
    '#2563eb',
    '#245b83',
    '#1d4ed8',
    '#1e40af',
    '#1e3a8a',
    '#3b82f6',
    '#0369a1',
  ]),
  help: new Set([
    '#dbeafe',
    '#eff6ff',
    '#eef4ff',
    '#bfdbfe',
    '#93c5fd',
    '#ede9fe',
  ]),
  error: new Set(['#b91c1c', '#b42318', '#991b1b']),
  errorSurface: new Set(['#fee2e2', '#fef2f2', '#fecaca', '#fca5a5']),
  warning: new Set([
    '#92400e',
    '#946200',
    '#9a3412',
    '#7c2d12',
    '#78350f',
    '#f59e0b',
  ]),
  warningSurface: new Set([
    '#fff7ed',
    '#fffbeb',
    '#fef3c7',
    '#fed7aa',
    '#fdba74',
  ]),
  success: new Set(['#166534', '#15803d', '#157f3d']),
  successSurface: new Set(['#dcfce7', '#ecfdf5', '#86efac']),
} satisfies Partial<Record<keyof ThemeColors, Set<string>>>;

/** Preserve semantic states and geometry while migrating legacy inline/native styles. */
export function themedColor(
  value: string,
  property: string,
  colors: ThemeColors,
): string {
  const color = value.toLowerCase();
  if (color === '#fff' || color === '#ffffff')
    return property === 'color' ? colors.onPrimary : colors.surface;
  for (const [role, values] of Object.entries(colorGroups)) {
    if (!values.has(color)) continue;
    if (
      property.toLowerCase().includes('border') &&
      role !== 'primary' &&
      role !== 'error' &&
      role !== 'warning' &&
      role !== 'success'
    )
      return colors.border;
    if (role === 'text' && property === 'backgroundColor')
      return colors.primary;
    return colors[role as keyof ThemeColors];
  }
  return value;
}
type NativeStyle = TextStyle | ViewStyle | ImageStyle;
export function themedStyle<T extends NativeStyle>(
  style: StyleProp<T>,
  colors: ThemeColors,
): StyleProp<T> {
  if (!style) return style;
  if (Array.isArray(style))
    return style.map((item) => themedStyle(item as StyleProp<T>, colors));
  const resolved = StyleSheet.flatten(style);
  return Object.fromEntries(
    Object.entries(resolved).map(([key, value]) => [
      key,
      typeof value === 'string' && key.toLowerCase().includes('color')
        ? themedColor(value, key, colors)
        : value,
    ]),
  ) as T;
}
export type Text = NativeText;
export const Text = forwardRef<NativeText, TextProps>((props, ref) => {
  const { colors } = useTheme();
  return (
    <NativeText
      {...props}
      ref={ref}
      style={[{ color: colors.text }, themedStyle(props.style, colors)]}
    />
  );
});
Text.displayName = 'ThemedText';
export const View = forwardRef<NativeView, ViewProps>((props, ref) => {
  const { colors } = useTheme();
  return (
    <NativeView {...props} ref={ref} style={themedStyle(props.style, colors)} />
  );
});
View.displayName = 'ThemedView';
export const Pressable = forwardRef<NativeView, PressableProps>(
  (props, ref) => {
    const { colors } = useTheme();
    const { style, ...rest } = props;
    return (
      <NativePressable
        {...rest}
        ref={ref}
        style={
          typeof style === 'function'
            ? (state) => themedStyle(style(state), colors)
            : themedStyle(style, colors)
        }
      />
    );
  },
);
Pressable.displayName = 'ThemedPressable';
export type TextInput = NativeTextInput;
export const TextInput = forwardRef<NativeTextInput, TextInputProps>(
  (props, ref) => {
    const { colors, mode } = useTheme();
    return (
      <NativeTextInput
        {...props}
        ref={ref}
        placeholderTextColor={colors.muted}
        keyboardAppearance={mode}
        style={[
          { color: colors.text, backgroundColor: colors.surface },
          themedStyle(props.style, colors),
        ]}
      />
    );
  },
);
TextInput.displayName = 'ThemedTextInput';
export type ScrollView = NativeScrollView;
export const ScrollView = forwardRef<NativeScrollView, ScrollViewProps>(
  (props, ref) => {
    const { colors } = useTheme();
    return (
      <NativeScrollView
        {...props}
        ref={ref}
        style={themedStyle(props.style, colors)}
        contentContainerStyle={themedStyle(props.contentContainerStyle, colors)}
      />
    );
  },
);
ScrollView.displayName = 'ThemedScrollView';
export function FlatList<T>(props: Readonly<FlatListProps<T>>) {
  const { colors } = useTheme();
  return (
    <NativeFlatList
      {...props}
      style={themedStyle(props.style, colors)}
      contentContainerStyle={themedStyle(props.contentContainerStyle, colors)}
    />
  );
}
export function ActivityIndicator(props: Readonly<ActivityIndicatorProps>) {
  const { colors } = useTheme();
  const color =
    typeof props.color === 'string'
      ? themedColor(props.color, 'color', colors)
      : colors.primary;
  return <NativeActivityIndicator {...props} color={color} />;
}
export function KeyboardAvoidingView(
  props: Readonly<KeyboardAvoidingViewProps>,
) {
  const { colors } = useTheme();
  return (
    <NativeKeyboardAvoidingView
      {...props}
      style={themedStyle(props.style, colors)}
    />
  );
}

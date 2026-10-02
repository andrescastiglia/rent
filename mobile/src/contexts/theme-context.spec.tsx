import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  ThemeProvider,
  useTheme,
  lightColors,
  darkColors,
} from './theme-context';
import {
  Text,
  View,
  Pressable,
  TextInput,
  FlatList,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  themedColor,
  themedStyle,
} from '@/components/themed-native';
import { Screen } from '@/components/screen';
import { AppButton, Field } from '@/components/ui';
import { TurnstileCaptcha } from '@/components/turnstile-captcha';

let app: ReactTestRenderer;
let theme: ReturnType<typeof useTheme>;
function Probe() {
  theme = useTheme();
  return <Text testID="mode">{theme.mode}</Text>;
}
async function mount(children = <Probe />) {
  await act(async () => {
    app = create(<ThemeProvider>{children}</ThemeProvider>);
  });
}
beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue('light');
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
});
afterEach(async () => {
  if (app) await act(async () => app.unmount());
});
const host = (id: string) =>
  app.root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === id,
  )[0];
const flatten = (value: unknown): Record<string, unknown> =>
  Array.isArray(value)
    ? Object.assign({}, ...value.map(flatten))
    : value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};

it('follows system appearance changes and an explicit override persists until system is selected again', async () => {
  await mount();
  expect(theme.preference).toBe('system');
  expect(theme.mode).toBe('light');
  jest.mocked(useColorScheme).mockReturnValue('dark');
  await act(async () =>
    app.update(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    ),
  );
  expect(theme.mode).toBe('dark');
  expect(theme.colors).toBe(darkColors);
  await act(async () => theme.setPreference('light'));
  expect(theme.mode).toBe('light');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    'rent.theme.preference',
    'light',
  );
  await act(async () => theme.setPreference('system'));
  expect(theme.mode).toBe('dark');
});
it.each(['dark', 'light'] as const)(
  'restores the saved %s preference independently of system appearance',
  async (preference) => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(preference);
    await mount();
    expect(theme.preference).toBe(preference);
    expect(theme.mode).toBe(preference);
  },
);
it('uses light when system appearance is unspecified and tolerates storage failure without reverting the user choice', async () => {
  jest.mocked(useColorScheme).mockReturnValue('unspecified');
  jest
    .mocked(SecureStore.getItemAsync)
    .mockRejectedValueOnce(new Error('Device locked'));
  await mount();
  expect(theme.mode).toBe('light');
  jest
    .mocked(SecureStore.setItemAsync)
    .mockRejectedValueOnce(new Error('Device locked'));
  await act(async () => theme.setPreference('dark'));
  expect(theme.mode).toBe('dark');
});
it('ignores invalid saved preferences and does not overwrite a choice made before storage resolves', async () => {
  let finish!: (value: string | null) => void;
  jest.mocked(SecureStore.getItemAsync).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await mount();
  await act(async () => {
    theme.setPreference('dark');
    finish('light');
  });
  expect(theme.mode).toBe('dark');
  await act(async () => app.unmount());
  jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce('invalid');
  await mount();
  expect(theme.preference).toBe('system');
});
it('ignores a saved preference arriving after the provider unmounts', async () => {
  let finish!: (value: string | null) => void;
  jest.mocked(SecureStore.getItemAsync).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await mount();
  await act(async () => {
    app.unmount();
    finish('dark');
  });
  expect(app.toJSON()).toBeNull();
  expect(theme.preference).toBe('system');
});
it('applies dark surfaces, readable default text, inputs, keyboard and enabled/disabled action contrast without altering content', async () => {
  jest.mocked(useColorScheme).mockReturnValue('dark');
  await mount(
    <Screen>
      <Probe />
      <View
        testID="card"
        style={{ backgroundColor: '#fff', borderColor: '#e2e8f0' }}
      >
        <Text testID="plain">Invoice USD 25</Text>
        <Field
          testID="amount"
          label="Amount"
          value="25"
          onChangeText={() => undefined}
        />
        <AppButton testID="pay" title="Pay" onPress={() => undefined} />
        <AppButton
          testID="cancel"
          title="Cancel"
          variant="secondary"
          disabled
          onPress={() => undefined}
        />
      </View>
    </Screen>,
  );
  expect(flatten(host('card').props.style)).toEqual({
    backgroundColor: darkColors.surface,
    borderColor: darkColors.border,
  });
  expect(flatten(host('plain').props.style).color).toBe(darkColors.text);
  expect(host('plain').props.children).toBe('Invoice USD 25');
  expect(flatten(host('amount').props.style).backgroundColor).toBe(
    darkColors.surface,
  );
  expect(host('amount').props.value).toBe('25');
  expect(host('amount').props.keyboardAppearance).toBe('dark');
  expect(host('amount').props.placeholderTextColor).toBe(darkColors.muted);
  expect(flatten(host('pay').props.style).backgroundColor).toBe(
    darkColors.primary,
  );
  expect(host('cancel').props.disabled).toBe(true);
  expect(
    flatten(app.root.findByType('SafeAreaView' as never).props.style)
      .backgroundColor,
  ).toBe(darkColors.background);
});
it('preserves geometry, dynamic press styles, list/scroll content and unknown colors while theming legacy native layouts', async () => {
  jest.mocked(useColorScheme).mockReturnValue('dark');
  await mount(
    <>
      <Probe />
      <Pressable
        testID="dynamic"
        style={({ pressed }) => ({
          backgroundColor: pressed ? '#dbeafe' : '#fff',
          padding: 12,
        })}
      />
      <TextInput testID="native-input" style={{ color: '#0f172a' }} />
      <ScrollView
        testID="scroll"
        contentContainerStyle={{ backgroundColor: '#f8fafc' }}
      />
      <FlatList
        testID="list"
        data={[]}
        renderItem={() => null}
        contentContainerStyle={{ backgroundColor: '#fff' }}
      />
      <ActivityIndicator testID="spinner" color="#ffffff" />
      <ActivityIndicator testID="default-spinner" />
      <KeyboardAvoidingView
        testID="keyboard"
        style={{ backgroundColor: '#fff' }}
      />
    </>,
  );
  expect(host('dynamic').props.style({ pressed: true })).toEqual({
    backgroundColor: darkColors.help,
    padding: 12,
  });
  expect(host('scroll').props.contentContainerStyle.backgroundColor).toBe(
    darkColors.background,
  );
  expect(host('list').props.contentContainerStyle.backgroundColor).toBe(
    darkColors.surface,
  );
  expect(host('spinner').props.color).toBe(darkColors.onPrimary);
  expect(host('default-spinner').props.color).toBe(darkColors.primary);
  expect(themedStyle(undefined, darkColors)).toBeUndefined();
  expect(themedStyle([{ backgroundColor: '#fff' }, false], darkColors)).toEqual(
    [{ backgroundColor: darkColors.surface }, false],
  );
  expect(themedColor('transparent', 'backgroundColor', darkColors)).toBe(
    'transparent',
  );
  expect(themedColor('#0f172a', 'backgroundColor', darkColors)).toBe(
    darkColors.primary,
  );
  expect(themedColor('#245b83', 'borderColor', darkColors)).toBe(
    darkColors.primary,
  );
});
it('keeps the CAPTCHA native surface and embedded widget in the selected theme', async () => {
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = 'theme-site-key';
  try {
    jest.mocked(useColorScheme).mockReturnValue('dark');
    await mount(
      <>
        <Probe />
        <TurnstileCaptcha onTokenChange={jest.fn()} />
      </>,
    );
    const widget = () => app.root.findByType('WebView' as never);
    expect(widget().props.source.html).toContain('theme: "dark"');
    expect(widget().props.source.html).toContain(
      `background: ${darkColors.surface}`,
    );
    expect(flatten(widget().props.style).backgroundColor).toBe(
      darkColors.surface,
    );
    await act(async () => theme.setPreference('light'));
    expect(widget().props.source.html).toContain('theme: "light"');
    expect(flatten(widget().props.style).backgroundColor).toBe(
      lightColors.surface,
    );
  } finally {
    delete process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
  }
});
it.each([
  ['#475569', 'muted'],
  ['#e2e8f0', 'border'],
  ['#f1f5f9', 'surfaceMuted'],
  ['#b91c1c', 'error'],
  ['#fee2e2', 'errorSurface'],
  ['#92400e', 'warning'],
  ['#fff7ed', 'warningSurface'],
  ['#166534', 'success'],
  ['#dcfce7', 'successSurface'],
] as const)('retains semantic state for %s in dark mode', (source, token) => {
  expect(themedColor(source, 'color', darkColors)).toBe(darkColors[token]);
});
function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
it.each([lightColors, darkColors])(
  'maintains AA text contrast for body, help, primary actions and status messages',
  (colors) => {
    for (const [text, surface] of [
      [colors.text, colors.surface],
      [colors.muted, colors.background],
      [colors.primary, colors.help],
      [colors.onPrimary, colors.primary],
      [colors.error, colors.errorSurface],
      [colors.warning, colors.warningSurface],
      [colors.success, colors.successSurface],
    ]) {
      const [high, low] = [luminance(text), luminance(surface)].sort(
        (a, b) => b - a,
      );
      expect((high + 0.05) / (low + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  },
);

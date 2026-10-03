globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('react-native', () => {
  const React = require('react');
  const component = (name) =>
    React.forwardRef((props, ref) =>
      React.createElement(name, { ...props, ref }, props.children),
    );
  const ScrollView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      scrollToEnd: jest.fn(),
      scrollTo: jest.fn(),
    }));
    return React.createElement('ScrollView', props, props.children);
  });
  return {
    View: component('View'),
    Text: component('Text'),
    Pressable: component('Pressable'),
    TextInput: component('TextInput'),
    ScrollView,
    KeyboardAvoidingView: component('KeyboardAvoidingView'),
    ActivityIndicator: component('ActivityIndicator'),
    Image: component('Image'),
    Modal: component('Modal'),
    Switch: component('Switch'),
    FlatList: (props) =>
      React.createElement(
        'FlatList',
        props,
        props.ListHeaderComponent,
        props.data.length
          ? props.data.map((item, index) =>
              React.createElement(
                React.Fragment,
                { key: props.keyExtractor?.(item) ?? index },
                props.renderItem({ item, index }),
                props.ItemSeparatorComponent
                  ? React.createElement(props.ItemSeparatorComponent)
                  : null,
              ),
            )
          : props.ListEmptyComponent,
        props.ListFooterComponent,
      ),
    AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
    Platform: {
      OS: 'android',
      select: (values) => values.android ?? values.default,
    },
    StyleSheet: {
      create: (styles) => styles,
      flatten: (styles) => {
        const merge = (value) =>
          Array.isArray(value)
            ? Object.assign({}, ...value.map(merge))
            : value || {};
        return merge(styles);
      },
      absoluteFillObject: {},
    },
    Alert: { alert: jest.fn() },
    LogBox: { ignoreAllLogs: jest.fn() },
    Keyboard: {
      addListener: jest.fn(() => ({ remove: jest.fn() })),
      dismiss: jest.fn(),
    },
    AccessibilityInfo: { announceForAccessibility: jest.fn() },
    Linking: { openURL: jest.fn(async () => true) },
    useColorScheme: jest.fn(() => 'light'),
    useWindowDimensions: () => ({ width: 390, height: 844 }),
    Dimensions: { get: () => ({ width: 390, height: 844 }) },
  };
});
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  SafeAreaProvider: 'SafeAreaProvider',
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 16, left: 0 }),
}));
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: 'DateTimePicker',
}));
jest.mock('@expo/vector-icons/Ionicons', () => ({
  __esModule: true,
  default: 'Ionicons',
}));
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
jest.mock('expo-router', () => {
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  };
  const Stack = 'Stack';
  const Tabs = 'Tabs';
  return {
    useRouter: () => router,
    usePathname: jest.fn(() => '/properties'),
    useLocalSearchParams: jest.fn(() => ({})),
    useSegments: jest.fn(() => ['(app)']),
    router,
    Stack: Object.assign(
      (props) => require('react').createElement(Stack, props, props.children),
      { Screen: 'StackScreen' },
    ),
    Tabs: Object.assign(
      (props) => require('react').createElement(Tabs, props, props.children),
      { Screen: 'TabsScreen' },
    ),
    Redirect: 'Redirect',
    Link: 'Link',
  };
});
jest.mock('expo-router/react-navigation', () => ({
  HeaderHeightContext: require('react').createContext(undefined),
}));
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 5,
  WHEN_UNLOCKED: 0,
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: jest.fn(async (_kind, value) => value),
  randomUUID: jest.fn(() => require('node:crypto').randomUUID()),
}));
jest.mock('expo-linking', () => ({ openURL: jest.fn(async () => true) }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: true,
    assets: [],
  })),
}));
jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
  downloadAsync: jest.fn(async () => ({
    uri: 'file:///cache/document.pdf',
    status: 200,
  })),
  writeAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'es-AR' }],
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  ExecutionEnvironment: { StoreClient: 'storeClient' },
  default: {
    executionEnvironment: 'storeClient',
    expoConfig: { extra: {} },
    manifest: { extra: {} },
  },
}));
jest.mock('@/i18n', () => ({
  i18n: { language: 'es', t: (key) => key, changeLanguage: jest.fn() },
}));
jest.mock('react-i18next', () => {
  const t = (key, values) => values?.defaultValue ?? key;
  const i18n = { language: 'es', t, changeLanguage: jest.fn() };
  return {
    useTranslation: () => ({ t, i18n }),
    initReactI18next: { type: '3rdParty', init: jest.fn() },
  };
});
const originalConsoleError = console.error;
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation((message, ...args) => {
    if (
      message ===
      'react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer'
    )
      return;
    originalConsoleError(message, ...args);
  });
});
afterEach(() => {
  console.error.mockRestore?.();
});

jest.mock('react-native-reanimated', () => ({}));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: 'GestureHandlerRootView',
}));
jest.mock('expo-status-bar', () => ({ StatusBar: 'StatusBar' }));

// Native calendar integration is disabled by default in component tests.
jest.mock('expo-calendar', () => ({
  getCalendarPermissions: jest.fn(async () => ({ granted: false })),
  requestCalendarPermissions: jest.fn(async () => ({ granted: false })),
  getCalendars: jest.fn(async () => []),
  AlarmMethod: { ALERT: 'alert' },
  EntityTypes: { EVENT: 'event' },
  SourceType: { LOCAL: 'local' },
  CalendarAccessLevel: { OWNER: 'owner' },
}));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'test-documents' },
  File: class {
    exists = false;
    async text() {
      return '{}';
    }
    write() {}
  },
}));

jest.mock('expo-location', () => ({
  Accuracy: { High: 4, Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({
    status: 'denied',
  })),
  getCurrentPositionAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
  hasStartedGeofencingAsync: jest.fn(async () => false),
  stopLocationUpdatesAsync: jest.fn(),
  stopGeofencingAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  startGeofencingAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({
    status: 'denied',
  })),
}));
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isAvailableAsync: jest.fn(async () => false),
}));

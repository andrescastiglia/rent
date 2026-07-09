import 'react-native-reanimated';
import '@/i18n';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import { enableScreens } from 'react-native-screens';

import { IS_E2E_MODE } from '@/api/env';
import { AppProviders } from '@/providers/app-providers';

if (IS_E2E_MODE) {
  enableScreens(false);
  LogBox.ignoreAllLogs(true);
}

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </AppProviders>
  );
}

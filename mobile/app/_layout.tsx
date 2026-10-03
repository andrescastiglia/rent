import 'react-native-reanimated';
import '@/i18n';
import '@/proximity/service';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';

import { IS_E2E_MODE } from '@/api/env';
import { AppProviders } from '@/providers/app-providers';
import { useTheme } from '@/contexts/theme-context';
import { useAuth } from '@/contexts/auth-context';
import { ActivityIndicator, View } from '@/components/themed-native';

if (IS_E2E_MODE) {
  LogBox.ignoreAllLogs(true);
}

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigation />
    </AppProviders>
  );
}
export function RootNavigation() {
  const { mode, colors } = useTheme();
  const { loading } = useAuth();
  // Mount the native navigation tree after session restoration completes.
  // Otherwise the initial redirect can replace a screen while its nested
  // native stack is still being attached.
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}

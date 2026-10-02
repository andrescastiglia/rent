import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';

export default function AuthLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="login" options={{ title: t('auth.login') }} />
      <Stack.Screen name="register" options={{ title: t('auth.register') }} />
    </Stack>
  );
}

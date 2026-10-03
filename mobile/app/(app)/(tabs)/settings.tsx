import { useRouter } from 'expo-router';
import { isInternalUser } from '@/config/navigation';
import { useTranslation } from 'react-i18next';
import { AppButton, ChoiceGroup } from '@/components/ui';
import { useTheme } from '@/contexts/theme-context';
import { Screen } from '@/components/screen';
import { useAuth } from '@/contexts/auth-context';

export default function SettingsScreen() {
  const { logout, user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Screen>
      <ChoiceGroup
        label={t('theme.title')}
        value={theme.preference}
        onChange={theme.setPreference}
        testID="theme.preference"
        options={[
          { value: 'system', label: t('theme.system') },
          { value: 'light', label: t('theme.light') },
          { value: 'dark', label: t('theme.dark') },
        ]}
      />
      {user && isInternalUser(user) && (
        <AppButton
          title="Asistencia a visitas y widget"
          onPress={() => router.push('/(app)/proximity' as never)}
        />
      )}
      <AppButton
        title={t('auth.logout')}
        onPress={() => void logout()}
        variant="secondary"
      />
    </Screen>
  );
}

import { useTranslation } from 'react-i18next';
import { AppButton, ChoiceGroup } from '@/components/ui';
import { useTheme } from '@/contexts/theme-context';
import { Screen } from '@/components/screen';
import { useAuth } from '@/contexts/auth-context';

export default function SettingsScreen() {
  const { logout } = useAuth();
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
      <AppButton
        title={t('auth.logout')}
        onPress={() => void logout()}
        variant="secondary"
      />
    </Screen>
  );
}

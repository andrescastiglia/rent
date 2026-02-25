import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, H1 } from '@/components/ui';
import { Screen } from '@/components/screen';
import { useAuth } from '@/contexts/auth-context';

export default function SettingsScreen() {
  const { logout } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Screen>
      <H1>{t('common.settings')}</H1>

      <View style={styles.links}>
        <AppButton
          title={t('leases.title')}
          variant="secondary"
          testID="settings.goto.leases"
          onPress={() => router.push('/(app)/leases' as never)}
        />
        <AppButton
          title={t('users.title')}
          variant="secondary"
          testID="settings.goto.users"
          onPress={() => router.push('/(app)/users' as never)}
        />
        <AppButton
          title={t('reports.title')}
          variant="secondary"
          testID="settings.goto.reports"
          onPress={() => router.push('/(app)/reports' as never)}
        />
        <AppButton
          title={t('invoices.title')}
          variant="secondary"
          testID="settings.goto.invoices"
          onPress={() => router.push('/(app)/invoices' as never)}
        />
        <AppButton
          title={t('templatesHub.listTitle')}
          variant="secondary"
          testID="settings.goto.templates"
          onPress={() => router.push('/(app)/templates' as never)}
        />
      </View>

      <AppButton title={t('auth.logout')} onPress={() => void logout()} variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  links: {
    gap: 8,
    marginBottom: 20,
  },
  link: {
    color: '#1f2937',
  },
});

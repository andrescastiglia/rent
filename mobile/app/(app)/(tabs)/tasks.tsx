import { Text, View } from '@/components/themed-native';
import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/screen';
import { AppButton } from '@/components/ui';
import { ChannelAlternatives } from '@/components/channel-alternatives';
import { useRoleNavigation } from '@/hooks/use-role-navigation';

const taskRoutes = new Set([
  '/properties',
  '/payments',
  '/tenants',
  '/leases',
  '/interested',
  '/invoices',
  '/sales',
  '/ai',
]);
export default function TasksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const items = useRoleNavigation().filter((item) => taskRoutes.has(item.href));
  return (
    <Screen>
      <View style={styles.list}>
        <Text style={styles.title}>{t('navigation.tasks')}</Text>
        <Text>{t('navigation.taskDescription')}</Text>
        {items.map((item) => (
          <AppButton
            key={item.href}
            title={t(`nav.${item.labelKey}`)}
            variant="secondary"
            onPress={() => router.push(`/(app)${item.href}` as never)}
            testID={`tasks.${item.labelKey}`}
          />
        ))}
        <ChannelAlternatives />
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  list: { gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: '#202832' },
});

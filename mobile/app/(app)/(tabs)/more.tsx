import { Text, View } from '@/components/themed-native';
import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/screen';
import { AppButton } from '@/components/ui';
import { ChannelAlternatives } from '@/components/channel-alternatives';
import { useRoleNavigation } from '@/hooks/use-role-navigation';

export default function MoreScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const items = useRoleNavigation();
  return (
    <Screen scrollViewTestID="more.scroll">
      <View style={styles.list}>
        <Text style={styles.title}>{t('navigation.more')}</Text>
        {items.map((item) => (
          <AppButton
            key={item.href}
            title={t(`nav.${item.labelKey}`)}
            variant="secondary"
            onPress={() => router.push(`/(app)${item.href}` as never)}
            testID={`more.${item.labelKey}`}
          />
        ))}
        <ChannelAlternatives />
        <AppButton
          title={t('common.settings')}
          variant="secondary"
          onPress={() => router.push('/(app)/(tabs)/settings' as never)}
        />
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  list: { gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: '#202832' },
});

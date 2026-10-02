import { Text, View } from '@/components/themed-native';
import * as Linking from 'expo-linking';
import { Alert, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppButton } from '@/components/ui';
import {
  authenticatedWebUrl,
  getWebCapabilities,
} from '@/config/channel-capabilities';
import { useAuth } from '@/contexts/auth-context';

export function ChannelAlternatives() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  if (!user) return null;
  const capabilities = getWebCapabilities(user);
  if (!capabilities.length) return null;
  return (
    <View style={styles.list}>
      <Text style={styles.title}>{t('channels.title')}</Text>
      <Text>{t('channels.authentication')}</Text>
      {capabilities.map((capability) => (
        <AppButton
          key={capability.id}
          title={`${t(capability.labelKey)} · ${t('channels.openWeb')}`}
          variant="secondary"
          testID={`channels.${capability.id}`}
          onPress={() => {
            void Linking.openURL(
              authenticatedWebUrl(capability.webPath, i18n.language),
            ).catch(() =>
              Alert.alert(t('common.error'), t('channels.openError')),
            );
          }}
        />
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  list: { gap: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#202832' },
});

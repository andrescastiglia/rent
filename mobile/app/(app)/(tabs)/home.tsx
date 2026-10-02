import { Text, View } from '@/components/themed-native';
import { useQuery } from '@tanstack/react-query';
import { ownersApi } from '@/api/owners';
import { getUserRoles, canUserAccessPath } from '@/config/navigation';
import { useRouter } from 'expo-router';

import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/screen';
import { AppButton } from '@/components/ui';
import { ChannelAlternatives } from '@/components/channel-alternatives';
import { useAuth } from '@/contexts/auth-context';

export default function HomeScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const ownerSummary = useQuery({
    queryKey: ['owners', 'my-summary'],
    queryFn: ownersApi.getMySummary,
    enabled: getUserRoles(user).includes('owner'),
  });
  return (
    <Screen>
      <View style={{ gap: 16 }}>
        {ownerSummary.isError ? (
          <View>
            <Text accessibilityRole="alert">{ownerSummary.error.message}</Text>
            <AppButton
              title={t('common.retry')}
              onPress={() => void ownerSummary.refetch()}
            />
          </View>
        ) : null}
        {ownerSummary.data ? (
          <View style={{ gap: 8 }}>
            <Text style={{ fontWeight: '700' }}>
              {t('channels.ownerSummary')} · {ownerSummary.data.period}
            </Text>
            <Text>
              {t('nav.properties')}: {ownerSummary.data.propertiesCount} ·{' '}
              {t('nav.leases')}: {ownerSummary.data.activeLeases}
            </Text>
            {ownerSummary.data.collectionsByCurrency.map((total) => (
              <Text key={total.currencyCode}>
                {t('sales.paidLabel')}: {total.currencyCode} {total.amount}
              </Text>
            ))}
          </View>
        ) : null}
        <Text style={{ fontSize: 28, color: '#202832', fontWeight: '700' }}>
          {t('navigation.home')}
        </Text>
        <Text>{t('navigation.welcome', { name: user?.firstName ?? '' })}</Text>
        <AppButton
          title={t('navigation.tasks')}
          onPress={() => router.push('/(app)/(tabs)/tasks' as never)}
        />
        {user && canUserAccessPath(user, '/dashboard') ? (
          <AppButton
            title={t('navigation.summary')}
            variant="secondary"
            onPress={() => router.push('/(app)/(tabs)/dashboard' as never)}
          />
        ) : null}
        <ChannelAlternatives />
      </View>
    </Screen>
  );
}

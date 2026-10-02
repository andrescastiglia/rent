import { Text, View } from '@/components/themed-native';

import { useTranslation } from 'react-i18next';
import { AppButton } from './ui';

export function QueryStatus({
  query,
  empty,
  emptyLabel,
}: Readonly<{
  query: { isLoading: boolean; error: unknown; refetch: () => unknown };
  empty: boolean;
  emptyLabel: string;
}>) {
  const { t } = useTranslation();
  if (query.isLoading) return <Text>{t('common.loading')}</Text>;
  if (query.error)
    return (
      <View>
        <Text accessibilityRole="alert" style={{ color: '#b91c1c' }}>
          {query.error instanceof Error
            ? query.error.message
            : t('common.loadError')}
        </Text>
        <AppButton
          title={t('common.retry')}
          onPress={() => {
            void query.refetch();
          }}
        />
      </View>
    );
  return empty ? <Text>{emptyLabel}</Text> : null;
}

import { Text, View } from '@/components/themed-native';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppButton } from '@/components/ui';
import type { Page } from '@/api/pagination';

export function Pagination({
  result,
  loading,
  onPage,
}: Readonly<{
  result?: Pick<Page<unknown>, 'page' | 'limit' | 'total'>;
  loading?: boolean;
  onPage: (page: number) => void;
}>) {
  const { t } = useTranslation();
  if (!result || result.total <= result.limit) return null;
  const pages = Math.ceil(result.total / result.limit);
  return (
    <View style={styles.container}>
      <Text accessibilityLiveRegion="polite">
        {t('pagination.status', {
          page: result.page,
          pages,
          total: result.total,
        })}
      </Text>
      <View style={styles.actions}>
        <AppButton
          title={t('pagination.previous')}
          variant="secondary"
          disabled={loading || result.page <= 1}
          onPress={() => onPage(result.page - 1)}
        />
        <AppButton
          title={t('pagination.next')}
          variant="secondary"
          disabled={loading || result.page >= pages}
          onPress={() => onPage(result.page + 1)}
        />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { gap: 8, paddingVertical: 16 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
});

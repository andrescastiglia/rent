import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { salesApi } from '@/api/sales';
import { ModuleListScreen } from '@/components/module-list';
import type { SaleFolder } from '@/types/sales';

export default function SalesScreen() {
  const { t } = useTranslation();

  return (
    <ModuleListScreen<SaleFolder>
      title={t('sales.title')}
      subtitle={t('sales.subtitle')}
      queryKey={['sales', 'folders']}
      queryFn={salesApi.getFolders}
      renderItem={(folder) => (
        <View style={styles.card}>
          <Text style={styles.title}>{folder.name}</Text>
          <Text style={styles.detail}>{folder.description ?? '-'}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
  },
  title: {
    fontWeight: '700',
    color: '#0f172a',
  },
  detail: {
    color: '#475569',
  },
});

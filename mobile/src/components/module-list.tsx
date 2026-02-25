import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/screen';
import { H1 } from '@/components/ui';

type ModuleListProps<T> = {
  title: string;
  subtitle?: string;
  queryKey: string[];
  queryFn: () => Promise<T[]>;
  renderItem: (item: T) => React.ReactNode;
};

export function ModuleListScreen<T>({ title, subtitle, queryFn, queryKey, renderItem }: ModuleListProps<T>) {
  const { t } = useTranslation();
  const query = useQuery({ queryKey, queryFn });

  if (query.isLoading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (query.isError) {
    return (
      <Screen>
        <H1>{title}</H1>
        <Text style={styles.error}>{(query.error as Error).message}</Text>
      </Screen>
    );
  }

  const items = query.data ?? [];

  return (
    <Screen>
      <H1>{title}</H1>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {items.length === 0 ? <Text style={styles.empty}>{t('common.noDataAvailable')}</Text> : null}
      <View style={styles.list}>{items.map((item, index) => <View key={index}>{renderItem(item)}</View>)}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtitle: {
    color: '#475569',
    marginBottom: 16,
  },
  list: {
    gap: 12,
  },
  empty: {
    color: '#64748b',
    marginBottom: 12,
  },
  error: {
    color: '#b91c1c',
  },
});

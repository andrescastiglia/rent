import {
  ActivityIndicator,
  FlatList,
  Text,
  View,
} from '@/components/themed-native';
import { useQuery } from '@tanstack/react-query';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/screen';
import { AppButton, H1 } from '@/components/ui';

type ModuleListProps<T> = Readonly<{
  title: string;
  subtitle?: string;
  queryKey: readonly string[];
  queryFn: () => Promise<T[]>;
  renderItem: (item: T) => React.ReactNode;
}>;

const getItemKey = <T,>(item: T): string => {
  if (typeof item === 'object' && item !== null && 'id' in item) {
    const candidate = item.id;
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      return String(candidate);
    }
  }
  return JSON.stringify(item);
};

function ItemSeparator() {
  return <View style={{ height: 12 }} />;
}

export function ModuleListScreen<T>({
  title,
  subtitle,
  queryFn,
  queryKey,
  renderItem,
}: ModuleListProps<T>) {
  const { t } = useTranslation();
  const query = useQuery({ queryKey, queryFn });

  if (query.isLoading) {
    return (
      <Screen scrollable={false} guidanceReady={false}>
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (query.isError) {
    return (
      <Screen guidanceBlocked>
        <H1>{title}</H1>
        <Text style={styles.error} accessibilityRole="alert">
          {query.error.message}
        </Text>
        <AppButton
          title={t('common.retry')}
          onPress={() => void query.refetch()}
        />
      </Screen>
    );
  }

  const items = query.data ?? [];

  return (
    <Screen scrollable={false}>
      <FlatList
        data={items}
        keyExtractor={getItemKey}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <H1>{title}</H1>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>{t('common.noDataAvailable')}</Text>
        }
        ItemSeparatorComponent={ItemSeparator}
        renderItem={({ item }) => <View>{renderItem(item)}</View>}
      />
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

import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ownersApi } from '@/api/owners';
import { ModuleListScreen } from '@/components/module-list';
import type { Owner } from '@/types/owner';

export default function OwnersScreen() {
  const { t } = useTranslation();

  return (
    <ModuleListScreen<Owner>
      title={t('properties.ownersTitle')}
      subtitle={t('properties.ownerListSubtitle')}
      queryKey={['owners']}
      queryFn={ownersApi.getAll}
      renderItem={(owner) => (
        <View style={styles.card}>
          <Text style={styles.title}>{`${owner.firstName} ${owner.lastName}`}</Text>
          <Text style={styles.detail}>{owner.email}</Text>
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
